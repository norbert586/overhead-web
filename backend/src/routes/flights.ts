import { Router, Request, Response } from 'express';
import { fetchAll } from '../services/adsb';
import { enrichAircraft, enrichCallsign } from '../services/enrichment';
import { classify } from '../services/classifier';
import { upsertFlight, getFlightHistory, getLog, getSessionStats, getLastKnownFlight, findPhotoByType } from '../database/queries';
import { requireAuth } from '../middleware/auth';
import type { FlightsResponse } from '../types/flight';

const router = Router();

router.use(requireAuth);

// GET /api/flights?lat=&lon=&radius=&record=
// record=false → ephemeral mode (Overhead tab): skip DB writes and return up to 3 closest.
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
          console.log(`[poll] adsb.lol: empty at ${radius}nm, found ${expanded.length} at ${r}nm`);
          break;
        }
      }
    }

    if (!allAc.length) {
      console.log('[poll] adsb.lol: no aircraft in range → returning lastKnown');
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

    console.log(`[poll] adsb.lol: ${allAc.length} aircraft in range (record=${record})`);

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
        altitudeFt:         typeof ac.alt_baro === 'number' ? ac.alt_baro : null,
        speedKts:           ac.gs    ?? null,
        bearingDeg:         ac.track ?? null,
        distanceNm:         ac.dst   ?? null,
        classification,
        photoUrl:           aircraftInfo.photoUrl ?? null,
      };

      if (record) {
        return upsertFlight(base, req.userId);
      }
      return { ...base, timesSeen: 0, firstSeen: nowIso, lastSeen: nowIso };
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
    console.error('GET /api/flights error:', err);
    res.status(502).json({ error: 'Failed to fetch flight data' });
  }
});

// GET /api/flights/photo-by-type/:type?exclude=N12345
// Last-resort photo fallback: returns any aircraft we've seen of the same ICAO
// type that has a stored photo. Used by the frontend AircraftPhoto waterfall
// when neither adsbdb nor Planespotters returns a hit for the actual airframe.
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

// GET /api/flights/:hex/history
router.get('/:hex/history', (req: Request, res: Response) => {
  const history = getFlightHistory(req.params.hex, req.userId);
  if (!history) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(history);
});

// GET /api/log?limit=50&offset=0&from=ISO&to=ISO
router.get('/log', (req: Request, res: Response) => {
  const limit    = Math.min(parseInt(req.query.limit  as string) || 50, 200);
  const offset   = parseInt(req.query.offset as string) || 0;
  const fromDate = (req.query.from as string | undefined) || undefined;
  const toDate   = (req.query.to   as string | undefined) || undefined;
  res.json(getLog(limit, offset, req.userId, fromDate, toDate));
});

export default router;
