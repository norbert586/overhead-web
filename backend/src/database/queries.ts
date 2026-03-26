import { run, get, all } from './db';
import type { Flight } from '../types/flight';

interface FlightRow extends Record<string, unknown> {
  hex: string;
  registration: string | null;
  callsign: string | null;
  aircraft_type: string | null;
  manufacturer: string | null;
  owner: string | null;
  operator: string | null;
  country: string | null;
  country_iso: string | null;
  origin_iata: string | null;
  origin_city: string | null;
  origin_country: string | null;
  destination_iata: string | null;
  destination_city: string | null;
  destination_country: string | null;
  altitude_ft: number | null;
  speed_kts: number | null;
  bearing_deg: number | null;
  distance_nm: number | null;
  classification: string;
  times_seen: number;
  first_seen: string;
  last_seen: string;
  photo_url: string | null;
}

function rowToFlight(row: FlightRow): Flight {
  return {
    hex: row.hex,
    registration: row.registration,
    callsign: row.callsign,
    aircraftType: row.aircraft_type,
    manufacturer: row.manufacturer,
    owner: row.owner,
    operator: row.operator,
    country: row.country,
    countryIso: row.country_iso,
    originIata: row.origin_iata,
    originCity: row.origin_city,
    originCountry: row.origin_country,
    destinationIata: row.destination_iata,
    destinationCity: row.destination_city,
    destinationCountry: row.destination_country,
    altitudeFt: row.altitude_ft,
    speedKts: row.speed_kts,
    bearingDeg: row.bearing_deg,
    distanceNm: row.distance_nm,
    classification: row.classification as Flight['classification'],
    timesSeen: row.times_seen,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    photoUrl: row.photo_url ?? null,
  };
}

// Gap before the same aircraft creates a new event row (matches working app)
const EVENT_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

/** Upsert a flight using event_key dedup + COALESCE to protect enrichment data */
export function upsertFlight(flight: Omit<Flight, 'timesSeen' | 'firstSeen' | 'lastSeen'>): Flight {
  const now = new Date().toISOString();
  const eventKey = `${flight.hex}|${flight.registration ?? ''}|${flight.callsign ?? ''}`;

  const existing = get<FlightRow>(
    'SELECT * FROM flights WHERE event_key = ? ORDER BY last_seen DESC LIMIT 1',
    [eventKey],
  );

  if (existing) {
    const gapMs = Date.now() - new Date(existing.last_seen as string).getTime();
    const isNewSighting = gapMs > EVENT_WINDOW_MS;

    if (isNewSighting) {
      // New event row — full insert, increment times_seen from previous best
      run(
        `INSERT INTO flights (
          event_key, hex, registration, callsign, aircraft_type, manufacturer,
          owner, operator, country, country_iso,
          origin_iata, origin_city, origin_country,
          destination_iata, destination_city, destination_country,
          altitude_ft, speed_kts, bearing_deg, distance_nm,
          classification, times_seen, first_seen, last_seen
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
        [
          eventKey, flight.hex, flight.registration, flight.callsign, flight.aircraftType,
          flight.manufacturer ?? existing.manufacturer,
          flight.owner ?? existing.owner,
          flight.operator ?? existing.operator,
          flight.country ?? existing.country,
          flight.countryIso ?? existing.country_iso,
          flight.originIata ?? existing.origin_iata,
          flight.originCity ?? existing.origin_city,
          flight.originCountry ?? existing.origin_country,
          flight.destinationIata ?? existing.destination_iata,
          flight.destinationCity ?? existing.destination_city,
          flight.destinationCountry ?? existing.destination_country,
          flight.altitudeFt, flight.speedKts, flight.bearingDeg, flight.distanceNm,
          flight.classification, now, now,
        ],
      );
    } else {
      // Same flyover — update telemetry, use COALESCE to never overwrite good enrichment with null
      run(
        `UPDATE flights SET
          altitude_ft      = ?,
          speed_kts        = ?,
          bearing_deg      = ?,
          distance_nm      = ?,
          classification   = ?,
          last_seen        = ?,
          manufacturer     = COALESCE(?, manufacturer),
          owner            = COALESCE(?, owner),
          operator         = COALESCE(?, operator),
          country          = COALESCE(?, country),
          country_iso      = COALESCE(?, country_iso),
          origin_iata      = COALESCE(?, origin_iata),
          origin_city      = COALESCE(?, origin_city),
          origin_country   = COALESCE(?, origin_country),
          destination_iata = COALESCE(?, destination_iata),
          destination_city = COALESCE(?, destination_city),
          destination_country = COALESCE(?, destination_country)
        WHERE id = ?`,
        [
          flight.altitudeFt, flight.speedKts, flight.bearingDeg, flight.distanceNm,
          flight.classification, now,
          flight.manufacturer, flight.owner, flight.operator,
          flight.country, flight.countryIso,
          flight.originIata, flight.originCity, flight.originCountry,
          flight.destinationIata, flight.destinationCity, flight.destinationCountry,
          existing.id as number,
        ],
      );
    }
  } else {
    // Brand new aircraft — first insert
    run(
      `INSERT INTO flights (
        event_key, hex, registration, callsign, aircraft_type, manufacturer,
        owner, operator, country, country_iso,
        origin_iata, origin_city, origin_country,
        destination_iata, destination_city, destination_country,
        altitude_ft, speed_kts, bearing_deg, distance_nm,
        classification, times_seen, first_seen, last_seen
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      [
        eventKey, flight.hex, flight.registration, flight.callsign, flight.aircraftType,
        flight.manufacturer, flight.owner, flight.operator, flight.country, flight.countryIso,
        flight.originIata, flight.originCity, flight.originCountry,
        flight.destinationIata, flight.destinationCity, flight.destinationCountry,
        flight.altitudeFt, flight.speedKts, flight.bearingDeg, flight.distanceNm,
        flight.classification, now, now,
      ],
    );
  }

  return rowToFlight(
    get<FlightRow>('SELECT * FROM flights WHERE event_key = ? ORDER BY last_seen DESC LIMIT 1', [eventKey])!,
  );
}

export function getFlightHistory(hex: string) {
  return get<{ hex: string; times_seen: number; first_seen: string; last_seen: string }>(
    'SELECT hex, times_seen, first_seen, last_seen FROM flights WHERE hex = ?',
    [hex],
  );
}

export function getLog(limit: number, offset: number): { flights: Flight[]; total: number } {
  const rows = all<FlightRow>(
    'SELECT * FROM flights ORDER BY last_seen DESC LIMIT ? OFFSET ?',
    [limit, offset],
  );
  const countRow = get<{ count: number }>('SELECT COUNT(*) as count FROM flights');
  return {
    flights: rows.map(rowToFlight),
    total: countRow?.count ?? 0,
  };
}

// ── Aircraft cache ───────────────────────────────────────────────────────────

const AIRCRAFT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AircraftCacheRow extends Record<string, unknown> {
  registration: string;
  aircraft_type: string | null;
  manufacturer: string | null;
  owner: string | null;
  country: string | null;
  country_iso: string | null;
  photo_url: string | null;
  cached_at: string;
}

export function getAircraftCache(registration: string): AircraftCacheRow | null {
  const row = get<AircraftCacheRow>(
    'SELECT * FROM aircraft_cache WHERE registration = ?',
    [registration],
  );
  if (!row) return null;
  const age = Date.now() - new Date(row.cached_at as string).getTime();
  if (age > AIRCRAFT_CACHE_TTL_MS) return null; // stale
  return row;
}

export function setAircraftCache(
  registration: string,
  data: {
    aircraftType: string | null;
    manufacturer: string | null;
    owner: string | null;
    country: string | null;
    countryIso: string | null;
    photoUrl: string | null;
  },
): void {
  run(
    `INSERT INTO aircraft_cache
       (registration, aircraft_type, manufacturer, owner, country, country_iso, photo_url, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(registration) DO UPDATE SET
       aircraft_type = excluded.aircraft_type,
       manufacturer  = excluded.manufacturer,
       owner         = excluded.owner,
       country       = excluded.country,
       country_iso   = excluded.country_iso,
       photo_url     = excluded.photo_url,
       cached_at     = excluded.cached_at`,
    [
      registration, data.aircraftType, data.manufacturer, data.owner,
      data.country, data.countryIso, data.photoUrl,
      new Date().toISOString(),
    ],
  );
}

// ── Callsign cache ───────────────────────────────────────────────────────────

const CALLSIGN_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CallsignCacheRow extends Record<string, unknown> {
  callsign: string;
  operator: string | null;
  origin_iata: string | null;
  origin_city: string | null;
  origin_country: string | null;
  destination_iata: string | null;
  destination_city: string | null;
  destination_country: string | null;
  cached_at: string;
}

export function getCallsignCache(callsign: string): CallsignCacheRow | null {
  const row = get<CallsignCacheRow>(
    'SELECT * FROM callsign_cache WHERE callsign = ?',
    [callsign],
  );
  if (!row) return null;
  const age = Date.now() - new Date(row.cached_at as string).getTime();
  if (age > CALLSIGN_CACHE_TTL_MS) return null;
  return row;
}

export function setCallsignCache(
  callsign: string,
  data: {
    operator: string | null;
    originIata: string | null;
    originCity: string | null;
    originCountry: string | null;
    destinationIata: string | null;
    destinationCity: string | null;
    destinationCountry: string | null;
  },
): void {
  run(
    `INSERT INTO callsign_cache
       (callsign, operator, origin_iata, origin_city, origin_country,
        destination_iata, destination_city, destination_country, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(callsign) DO UPDATE SET
       operator         = excluded.operator,
       origin_iata      = excluded.origin_iata,
       origin_city      = excluded.origin_city,
       origin_country   = excluded.origin_country,
       destination_iata = excluded.destination_iata,
       destination_city = excluded.destination_city,
       destination_country = excluded.destination_country,
       cached_at        = excluded.cached_at`,
    [
      callsign, data.operator, data.originIata, data.originCity, data.originCountry,
      data.destinationIata, data.destinationCity, data.destinationCountry,
      new Date().toISOString(),
    ],
  );
}

// ── Session stats ────────────────────────────────────────────────────────────

export function getSessionStats() {
  const totalRow = get<{ count: number }>('SELECT COUNT(*) as count FROM flights');
  const uniqueRow = get<{ count: number }>('SELECT COUNT(DISTINCT hex) as count FROM flights');

  const classRows = all<{ classification: string; count: number }>(
    'SELECT classification, COUNT(*) as count FROM flights GROUP BY classification',
  );
  const classCounts = { commercial: 0, private: 0, cargo: 0, government: 0 };
  for (const row of classRows) {
    const k = row.classification as keyof typeof classCounts;
    if (k in classCounts) classCounts[k] = row.count;
  }

  const topRows = all<{ aircraft_type: string; count: number }>(
    `SELECT aircraft_type, COUNT(*) as count FROM flights
     WHERE aircraft_type IS NOT NULL
     GROUP BY aircraft_type ORDER BY count DESC LIMIT 5`,
  );

  return {
    totalDetected: totalRow?.count ?? 0,
    uniqueAircraft: uniqueRow?.count ?? 0,
    classification: classCounts,
    topAircraft: topRows.map((r) => ({ type: r.aircraft_type, count: r.count })),
  };
}
