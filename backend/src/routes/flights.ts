import { Router, Request, Response } from 'express';
import { fetchAll } from '../services/adsb';
import { enrichAircraft, enrichCallsign } from '../services/enrichment';
import { classify } from '../services/classifier';
import { upsertFlight, getFlightHistory, getLog, getSessionStats, getLastKnownFlight, findPhotoByType } from '../database/queries';
import { scoreFlight } from '../services/interestScore';
import { requireAuth } from '../middleware/auth';
import { logger } from '../logger';
import type { FlightsResponse } from '../types/flight';

const log = logger.child({ module: 'flights' });

const router = Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/flights:
 *   get:
 *     summary: Poll nearby aircraft and (optionally) record sightings
 *     description: |
 *       record=false is ephemeral mode (Overhead tab) — skips DB writes and returns up to 3 closest aircraft.
 *       Otherwise records sightings for the authenticated user and returns the closest one.
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
 *         schema: { type: number, default: 25, description: Radius in nautical miles }
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
router.get('/', async (req: Request, res: Response) => {
  const lat    = parseFloat(req.query.lat    as string);
  const lon    = parseFloat(req.query.lon    as string);
  const radius = parseFloat(req.query.radius as string) || 25;
  const record = req.query.record !== 'false';

  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: 'lat and lon are required' });
    return;
  }

  try {
    let allAc = await fetchAll(lat, lon, radius);
    let matchedRadius = radius;

    // Overhead tab is often empty at small radii — expand the search so the user
    // sees the nearest contact and its true distance, instead of an empty pane.
    if (!allAc.length && !record) {
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
      log.debug('poll: no aircraft in range, returning lastKnown');
      const dbStats = getSessionStats(req.userId);
      // Overhead mode is ephemeral — never resurface a stale lastKnown.
      const lastKnown = record ? getLastKnownFlight(req.userId) : null;
      const response: FlightsResponse = {
        flights: lastKnown ? [lastKnown] : [],
        stats: { ...dbStats, activeCount: 0 },
        timestamp: new Date().toISOString(),
      };
      res.json(response);
      return;
    }

    log.debug({ count: allAc.length, record }, 'poll: aircraft in range');

    // Enrich all aircraft in parallel; upsert only when record=true.
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

      if (record) {
        return upsertFlight(base, signals, {
          lat: typeof ac.lat === 'number' ? ac.lat : null,
          lon: typeof ac.lon === 'number' ? ac.lon : null,
        }, req.userId);
      }

      // Ephemeral mode (Overhead tab) — score from the live event only.
      // We don't probe per-user history here; the carousel uses the recorded
      // path for any persistence-driven view.
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

      return {
        ...base,
        timesSeen: 0,
        firstSeen: nowIso,
        lastSeen:  nowIso,
        ...signals,
        interestScore:   score.score,
        interestTier:    score.tier,
        interestReasons: score.reasons,
      };
    }));

    // Closest first — adsb.lol returns sorted by distance, but enforce here so we can slice.
    const sorted = processed.slice().sort((a, b) => {
      const da = a.distanceNm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceNm ?? Number.POSITIVE_INFINITY;
      return da - db;
    });

    const dbStats = getSessionStats(req.userId);
    const response: FlightsResponse = {
      // Home: only the closest. Overhead: up to 3 closest.
      flights: record ? [sorted[0]] : sorted.slice(0, 3),
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
router.get('/photo-by-type/:type', (req: Request, res: Response) => {
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
router.get('/:hex/history', (req: Request, res: Response) => {
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
router.get('/log', (req: Request, res: Response) => {
  const limit    = Math.min(parseInt(req.query.limit  as string) || 50, 200);
  const offset   = parseInt(req.query.offset as string) || 0;
  const fromDate = (req.query.from as string | undefined) || undefined;
  const toDate   = (req.query.to   as string | undefined) || undefined;
  res.json(getLog(limit, offset, req.userId, fromDate, toDate));
});

export default router;
