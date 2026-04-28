import { Router, Request, Response } from 'express';
import { fetchAll } from '../services/adsb';
import { enrichAircraft, enrichCallsign } from '../services/enrichment';
import { classify } from '../services/classifier';
import { upsertFlight, getFlightHistory, getLog, getSessionStats, getLastKnownFlight } from '../database/queries';
import { requireAuth } from '../middleware/auth';
import type { FlightsResponse } from '../types/flight';

const router = Router();

router.use(requireAuth);

// GET /api/flights?lat=&lon=&radius=
router.get('/', async (req: Request, res: Response) => {
  const lat    = parseFloat(req.query.lat    as string);
  const lon    = parseFloat(req.query.lon    as string);
  const radius = parseFloat(req.query.radius as string) || 25;

  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ error: 'lat and lon are required' });
    return;
  }

  try {
    const allAc = await fetchAll(lat, lon, radius);

    if (!allAc.length) {
      console.log('[poll] adsb.lol: no aircraft in range → returning lastKnown');
      const dbStats = getSessionStats(req.userId);
      const lastKnown = getLastKnownFlight(req.userId);
      const response: FlightsResponse = {
        flights: lastKnown ? [lastKnown] : [],
        stats: { ...dbStats, activeCount: 0 },
        timestamp: new Date().toISOString(),
      };
      res.json(response);
      return;
    }

    console.log(`[poll] adsb.lol: ${allAc.length} aircraft in range`);

    // Enrich + upsert all aircraft in parallel; display shows the closest (index 0)
    const upserted = await Promise.all(allAc.map(async (ac) => {
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

      return upsertFlight({
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
      }, req.userId);
    }));

    const dbStats = getSessionStats(req.userId);
    const response: FlightsResponse = {
      flights: [upserted[0]],            // closest aircraft for the live display
      stats: { ...dbStats, activeCount: allAc.length },
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (err) {
    console.error('GET /api/flights error:', err);
    res.status(502).json({ error: 'Failed to fetch flight data' });
  }
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

// GET /api/log?limit=50&offset=0
router.get('/log', (req: Request, res: Response) => {
  const limit  = Math.min(parseInt(req.query.limit  as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  res.json(getLog(limit, offset, req.userId));
});

export default router;
