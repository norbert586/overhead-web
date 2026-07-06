import { Router, Request, Response } from 'express';
import { fetchAll } from '../services/adsb';
import { enrichAircraft, enrichCallsign } from '../services/enrichment';
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
 *       502: { description: Upstream fetch failed }
 */
router.get('/', optionalAuth, guestRateLimit, async (req: Request, res: Response) => {
  const lat    = parseFloat(req.query.lat    as string);
  const lon    = parseFloat(req.query.lon    as string);
  const radius = clampCatchRadius(parseFloat(req.query.radius as string));
  const record = req.query.record !== 'false';
  const isGuest = req.userId === undefined;

  // Guests get the live ephemeral view only — recording sightings is a
  // signed-in feature because the log/stats endpoints are user-scoped.
  if (isGuest && record) {
    res.status(401).json({ error: 'Sign in to record sightings' });
    return;
  }

  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: 'lat and lon are required' });
    return;
  }

  // Enforce the write-frequency floor. Over-eager polls still get a live
  // view, they just don't write. The timestamp is only stamped once we know
  // this poll will actually record, so an empty sky never burns the slot.
  let shouldRecord = record && !isGuest &&
    Date.now() - (lastRecordedAt.get(req.userId!) ?? 0) >= CATCH_MIN_RECORD_INTERVAL_MS;

  try {
    let allAc = await fetchAll(lat, lon, radius);
    let matchedRadius = radius;

    // The hearing radius is deliberately small, so it's often empty — expand
    // the search so the user sees the nearest contact and its true distance
    // instead of an empty pane. Expanded contacts are display-only: catching
    // only ever happens inside the actual hearing radius.
    if (!allAc.length) {
      shouldRecord = false;
      for (const r of [25, 50]) {
        if (r <= radius) continue;
        const expanded = await fetchAll(lat, lon, r);
        if (expanded.length) {
          allAc = expanded;
          matchedRadius = r;
          log.debug({ radius, expandedRadius: r, count: expanded.length }, 'poll: expanded radius');
          break;
        }
      }
    }

    if (!allAc.length) {
      log.debug('poll: no aircraft in range');
      const dbStats = isGuest ? EMPTY_STATS : getSessionStats(req.userId);
      const response: FlightsResponse = {
        flights: [],
        stats: { ...dbStats, activeCount: 0 },
        timestamp: new Date().toISOString(),
      };
      res.json(response);
      return;
    }

    log.debug({ count: allAc.length, record: shouldRecord }, 'poll: aircraft in range');

    if (shouldRecord) lastRecordedAt.set(req.userId!, Date.now());

    // Enrich all aircraft in parallel; upsert only when this poll records.
    const nowIso = new Date().toISOString();
    const processed = await Promise.all(allAc.map(async (ac) => {
      const callsign     = ac.flight?.trim() || null;
      const registration = ac.r?.trim()      || null;

      const [aircraftInfo, routeInfo] = await Promise.all([
        registration ? enrichAircraft(registration) : Promise.resolve({
          manufacturer: null, owner: null, country: null, countryIso: null, photoUrl: null,
        }),
        callsign ? enrichCallsign(callsign) : Promise.resolve({
          operator: null, originIata: null, originCity: null, originCountry: null,
          destinationIata: null, destinationCity: null, destinationCountry: null,
        }),
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

    // Closest first — adsb.lol returns sorted by distance, but enforce here so we can slice.
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
      flights: sorted.slice(0, 3),
      stats: { ...dbStats, activeCount: allAc.length },
      timestamp: new Date().toISOString(),
      ...(matchedRadius !== radius && { matchedRadiusNm: matchedRadius }),
    };

    res.json(response);
  } catch (err) {
    log.error({ err }, 'GET /api/flights error');
    res.status(502).json({ error: 'Failed to fetch flight data' });
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
