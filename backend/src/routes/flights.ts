import { Router, Request, Response } from 'express';
import { fetchArea } from '../services/adsb';
import {
  enrichAircraft, enrichCallsign, EMPTY_AIRCRAFT, EMPTY_ROUTE,
  type AircraftEnrichment, type RouteEnrichment,
} from '../services/enrichment';
import { classify } from '../services/classifier';
import {
  upsertFlight, getFlightHistory, getLog, getSessionStats, findPhotoByType,
  findRegistrationsByType, recordAircraftPhoto,
} from '../database/queries';
import { scoreFlight } from '../services/interestScore';
import { isNightAt } from '../services/solar';
import { evaluateAchievements } from '../services/achievementEngine';
import { requireAuth, optionalAuth, guestRateLimit } from '../middleware/auth';
import { clampCatchRadius, CATCH_MIN_RECORD_INTERVAL_MS } from '../config';
import { logger } from '../logger';
import type { FlightsResponse } from '../types/flight';
import type { PollInfo } from '../services/diagnostics';

const log = logger.child({ module: 'flights' });

const router = Router();

// GET / is the only guest-capable endpoint, and only in ephemeral mode
// (record=false). Everything else on this router still requires auth, so we
// gate per-route below rather than at the router level.
const EMPTY_STATS = {
  totalDetected: 0,
  uniqueAircraft: 0,
  classification: { commercial: 0, private: 0, cargo: 0, government: 0 },
  topAircraft: [] as { type: string; count: number }[],
};

// Per-user timestamp of the last poll that was allowed to write. Recording is
// client-driven under the catch model, so the server enforces the floor on
// write frequency — anything faster is served as live view only. In-memory is
// fine: a restart just lets the next poll record immediately.
const lastRecordedAt = new Map<number, number>();

// The catch screen shows the closest few contacts; only those need enriching
// when nothing is being recorded.
const DISPLAY_LIMIT = 3;

// Display-only search rings when the hearing radius is empty.
const EXPANDED_RADII_NM = [25, 50];

// Upper bound on how long a poll waits for adsbdb. Lookups that miss the
// budget keep running and land in the cache, so the next poll (10 s later)
// has them — and recorded rows are back-filled via COALESCE on that upsert.
const ENRICH_BUDGET_MS = 3_000;

function withinBudget<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ENRICH_BUDGET_MS);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

/**
 * @openapi
 * /api/flights:
 *   get:
 *     summary: Poll nearby aircraft and catch (record) whatever is overhead
 *     description: |
 *       The catch endpoint. While a signed-in user has the app open, the client
 *       polls this with the device's live position; every aircraft inside the
 *       hearing radius is recorded as a sighting ("caught"). record=false is
 *       ephemeral mode (guests) — no DB writes. The radius is clamped server-side
 *       to the hearing-radius cap; when nothing is in range the search expands
 *       for display only, and those contacts are never recorded.
 *     tags: [Flights]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: lon
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: radius
 *         schema: { type: number, default: 5, description: Hearing radius in nautical miles (clamped to 1-15) }
 *       - in: query
 *         name: record
 *         schema: { type: string, enum: ['true', 'false'], default: 'true' }
 *     responses:
 *       200:
 *         description: Flight data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 flights:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Flight' }
 *                 stats: { type: object }
 *                 timestamp: { type: string, format: date-time }
 *       400: { description: Missing lat/lon }
 *       401: { description: "Recording requested without a valid session (code: auth_required | auth_expired | auth_invalid)" }
 *       429: { description: Guest rate limit (code: rate_limited) }
 *       500: { description: Server error processing the poll (code: server_error) }
 *       502: { description: "Every ADS-B provider is unreachable (code: upstream_unavailable)" }
 */
router.get('/', optionalAuth, guestRateLimit, async (req: Request, res: Response) => {
  const lat    = parseFloat(req.query.lat    as string);
  const lon    = parseFloat(req.query.lon    as string);
  const radius = clampCatchRadius(parseFloat(req.query.radius as string));
  const record = req.query.record !== 'false';
  const isGuest = req.userId === undefined;

  // Guests get the live ephemeral view only — recording sightings is a
  // signed-in feature because the log/stats endpoints are user-scoped. A
  // signed-in client whose token has lapsed lands here too: tell it the
  // session expired so it can send the user to sign in, rather than a
  // generic refusal it can only show as "flight data unavailable".
  if (isGuest && record) {
    const code = req.authFailure ?? 'auth_required';
    res.status(401).json({
      error: code === 'auth_required' ? 'Sign in to record sightings' : 'Session expired — sign in again',
      code,
    });
    return;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).json({ error: 'lat and lon are required', code: 'bad_request' });
    return;
  }

  // Enforce the write-frequency floor. Over-eager polls still get a live
  // view, they just don't write. The timestamp is only stamped once we know
  // this poll will actually record, so an empty sky never burns the slot.
  let shouldRecord = record && !isGuest &&
    Date.now() - (lastRecordedAt.get(req.userId!) ?? 0) >= CATCH_MIN_RECORD_INTERVAL_MS;

  try {
    // One upstream fetch answers the hearing radius and the display-only
    // expansion alike (see AREA_RADIUS_NM).
    const area = await fetchArea(lat, lon);
    // What this poll saw, for the diagnostics poll log (metricsMiddleware
    // reads it when the response finishes).
    const poll: PollInfo = {
      areaSource: area.source,
      provider: area.provider,
      aircraftInArea: area.aircraft.length,
    };
    res.locals.poll = poll;

    // Every provider failed and nothing recent is cached — that's an
    // upstream outage, not an empty sky. Say so instead of serving a
    // fake-empty 200 that leaves the client "listening" forever.
    if (!area.ok) {
      poll.outcome = 'upstream_unavailable';
      log.error('poll: all flight data sources unreachable');
      res.status(502).json({ error: 'Live flight data sources are unreachable', code: 'upstream_unavailable' });
      return;
    }

    // A stale snapshot is fine to look at but not to catch from — the user
    // wasn't necessarily under those positions.
    if (area.stale) shouldRecord = false;

    let allAc = area.aircraft.filter((ac) => ac.dst! <= radius);
    let matchedRadius = radius;
    poll.inRange = allAc.length;

    // The hearing radius is deliberately small, so it's often empty — widen
    // the view so the user sees the nearest contact and its true distance
    // instead of an empty pane. Expanded contacts are display-only: catching
    // only ever happens inside the actual hearing radius.
    if (!allAc.length) {
      shouldRecord = false;
      for (const r of EXPANDED_RADII_NM) {
        if (r <= radius) continue;
        const within = area.aircraft.filter((ac) => ac.dst! <= r);
        if (within.length) {
          allAc = within;
          matchedRadius = r;
          log.debug({ radius, expandedRadius: r, count: within.length }, 'poll: expanded radius');
          break;
        }
      }
    }

    const freshness = area.stale ? { stale: true, dataAgeSec: Math.round(area.ageMs / 1000) } : {};
    if (area.stale) poll.dataAgeSec = Math.round(area.ageMs / 1000);
    if (matchedRadius !== radius) poll.matchedRadiusNm = matchedRadius;

    if (!allAc.length) {
      poll.outcome = area.stale ? 'stale_empty' : 'empty';
      log.debug('poll: no aircraft in range');
      const dbStats = isGuest ? EMPTY_STATS : getSessionStats(req.userId);
      const response: FlightsResponse = {
        flights: [],
        stats: { ...dbStats, activeCount: 0 },
        timestamp: new Date().toISOString(),
        ...freshness,
      };
      res.json(response);
      return;
    }

    log.debug({ count: allAc.length, record: shouldRecord }, 'poll: aircraft in range');

    if (shouldRecord) lastRecordedAt.set(req.userId!, Date.now());
    poll.recorded = shouldRecord ? allAc.length : 0;
    poll.outcome = area.stale ? 'stale' : matchedRadius !== radius ? 'expanded' : 'ok';

    // A recording poll catches everything inside the hearing radius, so all
    // of it is enriched and upserted. A display-only poll shows just the
    // closest few — enriching the rest (up to every aircraft within 50 nm)
    // was the main reason first loads in a new area were slow.
    const toProcess = shouldRecord ? allAc : allAc.slice(0, DISPLAY_LIMIT);

    const nowIso = new Date().toISOString();
    const processed = await Promise.all(toProcess.map(async (ac) => {
      const callsign     = ac.flight?.trim() || null;
      const registration = ac.r?.trim()      || null;

      const [aircraftInfo, routeInfo] = await Promise.all([
        registration
          ? withinBudget<AircraftEnrichment>(enrichAircraft(registration), EMPTY_AIRCRAFT)
          : Promise.resolve(EMPTY_AIRCRAFT),
        callsign
          ? withinBudget<RouteEnrichment>(enrichCallsign(callsign), EMPTY_ROUTE)
          : Promise.resolve(EMPTY_ROUTE),
      ]);

      const classification = classify({
        callsign,
        operator: routeInfo.operator,
        owner:    aircraftInfo.owner,
        typeCode: ac.t ?? null,
      });

      const altitudeFt = typeof ac.alt_baro === 'number' ? ac.alt_baro : null;
      const baroRateFpm =
        typeof ac.baro_rate === 'number' ? ac.baro_rate
        : typeof ac.geom_rate === 'number' ? ac.geom_rate
        : null;

      const base = {
        hex:                ac.hex,
        registration,
        callsign,
        aircraftType:       ac.t ?? null,
        manufacturer:       aircraftInfo.manufacturer,
        owner:              aircraftInfo.owner,
        operator:           routeInfo.operator,
        country:            aircraftInfo.country,
        countryIso:         aircraftInfo.countryIso,
        originIata:         routeInfo.originIata,
        originCity:         routeInfo.originCity,
        originCountry:      routeInfo.originCountry,
        destinationIata:    routeInfo.destinationIata,
        destinationCity:    routeInfo.destinationCity,
        destinationCountry: routeInfo.destinationCountry,
        altitudeFt,
        speedKts:           ac.gs    ?? null,
        bearingDeg:         ac.track ?? null,
        distanceNm:         ac.dst   ?? null,
        classification,
        photoUrl:           aircraftInfo.photoUrl ?? null,
      };

      const signals = {
        squawk:      ac.squawk?.trim() || null,
        emergency:   ac.emergency?.trim() || null,
        baroRateFpm,
        category:    ac.category?.trim() || null,
        mlat:        Array.isArray(ac.mlat) && ac.mlat.length > 0,
      };

      if (shouldRecord) {
        return upsertFlight(base, signals, {
          lat: typeof ac.lat === 'number' ? ac.lat : null,
          lon: typeof ac.lon === 'number' ? ac.lon : null,
        }, req.userId, { lat, lon });
      }

      // Ephemeral mode (guests, throttled polls, expanded-radius contacts) —
      // score from the live event only; nothing is persisted.
      const score = scoreFlight({
        classification,
        hex:         base.hex,
        callsign,
        typeCode:    base.aircraftType,
        originIata:  base.originIata,
        destinationIata: base.destinationIata,
        altitudeFt,
        speedKts:    base.speedKts,
        baroRateFpm,
        distanceNm:  base.distanceNm,
        category:    signals.category,
        squawk:      signals.squawk,
        emergency:   signals.emergency,
        mlat:        signals.mlat,
        isNight: (typeof ac.lat === 'number' && typeof ac.lon === 'number')
          ? isNightAt(new Date(nowIso), ac.lat, ac.lon)
          : false,
        personalTypeSightings:  null,
        personalRouteSightings: null,
        isFirstHexForUser:      false,
        isFirstTypeForUser:     false,
        isFirstOperatorForUser: false,
        isFirstRouteForUser:    false,
        // Ephemeral mode doesn't persist a track, so no trajectory analysis.
        trajectoryScore:        0,
        trajectoryReasons:      [],
      });

      // Signed-in users still see their real catch history on ephemeral polls
      // (throttled or expanded-radius), so NEW badges and seen-counts don't
      // flicker between recording and non-recording responses.
      const history = !isGuest ? getFlightHistory(ac.hex, req.userId!) : null;

      return {
        ...base,
        timesSeen: history?.times_seen ?? 0,
        firstSeen: history?.first_seen ?? nowIso,
        lastSeen:  history?.last_seen  ?? nowIso,
        ...signals,
        interestScore:   score.score,
        interestTier:    score.tier,
        interestReasons: score.reasons,
        caughtLat:       null,
        caughtLon:       null,
      };
    }));

    // Closest first — fetchArea already sorts, but enforce here so we can slice.
    const sorted = processed.slice().sort((a, b) => {
      const da = a.distanceNm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceNm ?? Number.POSITIVE_INFINITY;
      return da - db;
    });

    // Achievements were previously evaluated by the background scanner; under
    // the catch model the recording poll is the only place sightings land.
    if (shouldRecord) evaluateAchievements(req.userId!);

    const dbStats = isGuest ? EMPTY_STATS : getSessionStats(req.userId);
    const response: FlightsResponse = {
      flights: sorted.slice(0, DISPLAY_LIMIT),
      stats: { ...dbStats, activeCount: allAc.length },
      timestamp: new Date().toISOString(),
      ...(matchedRadius !== radius && { matchedRadiusNm: matchedRadius }),
      ...freshness,
    };

    res.json(response);
  } catch (err) {
    // Anything that reaches here is our bug (DB, scoring), not the feed —
    // report it as a server error so the client doesn't blame upstream.
    log.error({ err }, 'GET /api/flights error');
    res.status(500).json({ error: 'Failed to process flight data', code: 'server_error' });
  }
});

/**
 * @openapi
 * /api/flights/photo-by-type/{type}:
 *   get:
 *     summary: Fallback photo lookup by ICAO aircraft type
 *     tags: [Flights]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: exclude
 *         schema: { type: string, description: Registration to exclude from the result }
 *     responses:
 *       200: { description: Photo found }
 *       400: { description: Missing type }
 *       404: { description: No photo for type }
 */
router.get('/photo-by-type/:type', requireAuth, (req: Request, res: Response) => {
  const type    = (req.params.type ?? '').trim().toUpperCase();
  const exclude = ((req.query.exclude as string | undefined) ?? '').trim().toUpperCase() || null;
  if (!type) {
    res.status(400).json({ error: 'type is required' });
    return;
  }
  const hit = findPhotoByType(type, exclude);
  if (!hit) {
    res.status(404).json({ error: 'No photo for type' });
    return;
  }
  res.json(hit);
});

/**
 * @openapi
 * /api/flights/type-registrations/{type}:
 *   get:
 *     summary: Known registrations of an ICAO type (surrogate-photo candidates)
 *     tags: [Flights]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: exclude
 *         schema: { type: string }
 *     responses:
 *       200: { description: Registration list }
 */
router.get('/type-registrations/:type', requireAuth, (req: Request, res: Response) => {
  const type    = (req.params.type ?? '').trim().toUpperCase();
  const exclude = ((req.query.exclude as string | undefined) ?? '').trim().toUpperCase() || null;
  if (!type) {
    res.status(400).json({ error: 'type is required' });
    return;
  }
  res.json({ registrations: findRegistrationsByType(type, exclude) });
});

// Only accept photo URLs from hosts the waterfall actually fetches from, so
// this can't be used to plant arbitrary links in the shared cache.
const PHOTO_HOST_ALLOWLIST = ['plnspttrs.net', 'planespotters.net'];

function isAllowedPhotoUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return PHOTO_HOST_ALLOWLIST.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

/**
 * @openapi
 * /api/flights/photo-cache:
 *   post:
 *     summary: Record a Planespotters photo the client found, growing the shared pool
 *     tags: [Flights]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               registration: { type: string }
 *               photoUrl: { type: string }
 *     responses:
 *       204: { description: Stored }
 *       400: { description: Invalid registration or URL }
 */
router.post('/photo-cache', requireAuth, (req: Request, res: Response) => {
  const { registration, photoUrl, aircraftType } = req.body as {
    registration?: string; photoUrl?: string; aircraftType?: string;
  };
  const reg = (registration ?? '').trim().toUpperCase();
  if (!reg || reg.length > 12 || !/^[A-Z0-9-]+$/.test(reg)) {
    res.status(400).json({ error: 'Invalid registration' });
    return;
  }
  if (typeof photoUrl !== 'string' || photoUrl.length > 500 || !isAllowedPhotoUrl(photoUrl)) {
    res.status(400).json({ error: 'Invalid photo URL' });
    return;
  }
  const type = (aircraftType ?? '').trim().toUpperCase();
  const validType = type && type.length <= 8 && /^[A-Z0-9]+$/.test(type) ? type : null;
  recordAircraftPhoto(reg, photoUrl, validType);
  res.status(204).end();
});

/**
 * @openapi
 * /api/flights/{hex}/history:
 *   get:
 *     summary: Get the per-user sighting history for a given ICAO hex code
 *     tags: [Flights]
 *     parameters:
 *       - in: path
 *         name: hex
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: History }
 *       404: { description: Not found }
 */
router.get('/:hex/history', requireAuth, (req: Request, res: Response) => {
  const history = getFlightHistory(req.params.hex, req.userId);
  if (!history) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(history);
});

/**
 * @openapi
 * /api/log:
 *   get:
 *     summary: Paginated log of sightings for the authenticated user
 *     tags: [Flights]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200: { description: Sighting log }
 */
router.get('/log', requireAuth, (req: Request, res: Response) => {
  const limit    = Math.min(parseInt(req.query.limit  as string) || 50, 200);
  const offset   = parseInt(req.query.offset as string) || 0;
  const fromDate = (req.query.from as string | undefined) || undefined;
  const toDate   = (req.query.to   as string | undefined) || undefined;
  res.json(getLog(limit, offset, req.userId, fromDate, toDate));
});

export default router;
