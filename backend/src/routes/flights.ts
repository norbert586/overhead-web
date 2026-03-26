import { Router, Request, Response } from 'express';
import { fetchClosest } from '../services/adsb';
import { enrichAircraft, enrichCallsign } from '../services/enrichment';
import { classify } from '../services/classifier';
import { upsertFlight, getFlightHistory, getLog, getSessionStats } from '../database/queries';
import type { FlightsResponse } from '../types/flight';

const router = Router();

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
    const ac = await fetchClosest(lat, lon, radius);

    if (!ac) {
      // No aircraft in range — return empty with current db stats
      const dbStats = getSessionStats();
      const response: FlightsResponse = {
        flights: [],
        stats: { ...dbStats, activeCount: 0 },
        timestamp: new Date().toISOString(),
      };
      res.json(response);
      return;
    }

    const callsign     = ac.flight?.trim() || null;
    const registration = ac.r?.trim()      || null;

    // Enrich in parallel
    const [aircraftInfo, routeInfo] = await Promise.all([
      registration ? enrichAircraft(registration) : Promise.resolve({
        manufacturer: null, owner: null, country: null, countryIso: null,
      }),
      callsign ? enrichCallsign(callsign) : Promise.resolve({
        operator: null, originIata: null, originCity: null, originCountry: null,
        destinationIata: null, destinationCity: null, destinationCountry: null,
      }),
    ]);

    const classification = classify({
      callsign,
      operator: routeInfo.operator,
      owner: aircraftInfo.owner,
      typeCode: ac.t ?? null,
    });

    const flight = upsertFlight({
      hex:              ac.hex,
      registration,
      callsign,
      aircraftType:     ac.t ?? null,
      manufacturer:     aircraftInfo.manufacturer,
      owner:            aircraftInfo.owner,
      operator:         routeInfo.operator,
      country:          aircraftInfo.country,
      countryIso:       aircraftInfo.countryIso,
      originIata:       routeInfo.originIata,
      originCity:       routeInfo.originCity,
      originCountry:    routeInfo.originCountry,
      destinationIata:  routeInfo.destinationIata,
      destinationCity:  routeInfo.destinationCity,
      destinationCountry: routeInfo.destinationCountry,
      altitudeFt:       typeof ac.alt_baro === 'number' ? ac.alt_baro : null,
      speedKts:         ac.gs    ?? null,
      bearingDeg:       ac.track ?? null,
      distanceNm:       ac.dst   ?? null,
      classification,
      photoUrl:         null, // photos fetched client-side from Planespotters
    });

    const dbStats = getSessionStats();
    const response: FlightsResponse = {
      flights: [flight],
      stats: { ...dbStats, activeCount: 1 },
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
  const history = getFlightHistory(req.params.hex);
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
  res.json(getLog(limit, offset));
});

export default router;
