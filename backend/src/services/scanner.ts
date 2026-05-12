import { getAllUsersWithLocation } from '../database/queries';
import { upsertFlight } from '../database/queries';
import { fetchAll } from './adsb';
import { enrichAircraft, enrichCallsign } from './enrichment';
import { classify } from './classifier';
import { evaluateAchievements } from './achievementEngine';
import { logger } from '../logger';
import type { AdsbAircraft } from '../types/flight';

const log = logger.child({ module: 'scanner' });

const SCAN_INTERVAL_MS = 12_000;

async function processAircraft(ac: AdsbAircraft, userId: number): Promise<void> {
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

  // Raw event signals — straight from adsb.lol, no extra request.
  // baro_rate is preferred; fall back to geom_rate when the aircraft lacks
  // a barometric source.
  const baroRateFpm =
    typeof ac.baro_rate === 'number' ? ac.baro_rate
    : typeof ac.geom_rate === 'number' ? ac.geom_rate
    : null;

  upsertFlight({
    hex:                ac.hex,
    registration,
    callsign,
    aircraftType:       ac.t  ?? null,
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
  }, {
    squawk:      ac.squawk?.trim() || null,
    emergency:   ac.emergency?.trim() || null,
    baroRateFpm,
    category:    ac.category?.trim() || null,
    mlat:        Array.isArray(ac.mlat) && ac.mlat.length > 0,
  }, userId);
}

// Guard against overlapping scan cycles (e.g. slow enrichment on a big batch)
let scanning = false;

async function scanAll(): Promise<void> {
  if (scanning) return;
  scanning = true;
  try {
    const users = getAllUsersWithLocation();
    if (!users.length) return;

    for (const user of users) {
      try {
        const aircraft = await fetchAll(user.latitude, user.longitude, user.radiusNm);
        if (!aircraft.length) {
          log.debug({ userId: user.id }, 'no aircraft in range');
          continue;
        }
        log.info({ userId: user.id, count: aircraft.length }, 'processing aircraft batch');

        // Process sequentially to avoid hammering enrichment APIs
        // (enrichment is cached, so repeat aircraft are instant after the first hit)
        for (const ac of aircraft) {
          try {
            await processAircraft(ac, user.id);
          } catch (err) {
            log.error({ err, hex: ac.hex }, 'processAircraft error');
          }
        }

        // Evaluate achievements after each user's batch — non-blocking
        evaluateAchievements(user.id);
      } catch (err) {
        log.error({ err, userId: user.id }, 'scan error');
      }
    }
  } finally {
    scanning = false;
  }
}

export function startScanner(): void {
  log.info({ intervalSec: SCAN_INTERVAL_MS / 1000 }, 'background scan loop started');
  void scanAll();
  setInterval(() => void scanAll(), SCAN_INTERVAL_MS);
}
