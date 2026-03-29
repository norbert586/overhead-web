import { run, get, all } from './db';
import type { Flight } from '../types/flight';

// ── User management ──────────────────────────────────────────────────────────

interface UserRow extends Record<string, unknown> {
  id: number;
  email: string;
  password_hash: string;
  invite_code: string | null;
  created_at: string;
}

export function createUser(email: string, passwordHash: string, inviteCode: string): UserRow {
  run(
    `INSERT INTO users (email, password_hash, invite_code) VALUES (?, ?, ?)`,
    [email, passwordHash, inviteCode],
  );
  return get<UserRow>('SELECT * FROM users WHERE email = ?', [email])!;
}

export function findUserByEmail(email: string): UserRow | null {
  return get<UserRow>('SELECT * FROM users WHERE email = ?', [email]) ?? null;
}

export function findUserById(id: number): UserRow | null {
  return get<UserRow>('SELECT * FROM users WHERE id = ?', [id]) ?? null;
}

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
export function upsertFlight(
  flight: Omit<Flight, 'timesSeen' | 'firstSeen' | 'lastSeen'>,
  userId: number,
): Flight {
  const now = new Date().toISOString();
  const eventKey = `${userId}|${flight.hex}|${flight.registration ?? ''}|${flight.callsign ?? ''}`;

  const existing = get<FlightRow>(
    'SELECT * FROM flights WHERE event_key = ? ORDER BY last_seen DESC LIMIT 1',
    [eventKey],
  );

  if (existing) {
    const gapMs = Date.now() - new Date(existing.last_seen as string).getTime();
    const isNewSighting = gapMs > EVENT_WINDOW_MS;

    if (isNewSighting) {
      // New flyover after gap — carry forward the highest times_seen ever recorded
      // for this aircraft + 1, so the counter is truly cumulative across all visits
      const maxRow = get<{ max_seen: number }>(
        'SELECT MAX(times_seen) as max_seen FROM flights WHERE hex = ? AND user_id = ?',
        [flight.hex, userId],
      );
      const nextSeen = (maxRow?.max_seen ?? 0) + 1;

      run(
        `INSERT INTO flights (
          user_id, event_key, hex, registration, callsign, aircraft_type, manufacturer,
          owner, operator, country, country_iso,
          origin_iata, origin_city, origin_country,
          destination_iata, destination_city, destination_country,
          altitude_ft, speed_kts, bearing_deg, distance_nm,
          classification, times_seen, first_seen, last_seen
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          userId, eventKey, flight.hex, flight.registration, flight.callsign, flight.aircraftType,
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
          flight.classification, nextSeen, now, now,
        ],
      );
    } else {
      // Same flyover — increment times_seen and refresh telemetry
      // COALESCE protects enrichment data: never overwrite good data with null
      run(
        `UPDATE flights SET
          times_seen       = times_seen + 1,
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
        user_id, event_key, hex, registration, callsign, aircraft_type, manufacturer,
        owner, operator, country, country_iso,
        origin_iata, origin_city, origin_country,
        destination_iata, destination_city, destination_country,
        altitude_ft, speed_kts, bearing_deg, distance_nm,
        classification, times_seen, first_seen, last_seen
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      [
        userId, eventKey, flight.hex, flight.registration, flight.callsign, flight.aircraftType,
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

export function getFlightHistory(hex: string, userId: number) {
  return get<{ hex: string; times_seen: number; first_seen: string; last_seen: string }>(
    'SELECT hex, times_seen, first_seen, last_seen FROM flights WHERE hex = ? AND user_id = ?',
    [hex, userId],
  );
}

export function getLog(limit: number, offset: number, userId: number): { flights: Flight[]; total: number } {
  const rows = all<FlightRow>(
    'SELECT * FROM flights WHERE user_id = ? ORDER BY last_seen DESC LIMIT ? OFFSET ?',
    [userId, limit, offset],
  );
  const countRow = get<{ count: number }>('SELECT COUNT(*) as count FROM flights WHERE user_id = ?', [userId]);
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

// ── Full stats dashboard ─────────────────────────────────────────────────────

export function getAllStats(userId: number) {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

  // All-time summary
  const summaryRow = get<{
    total_events: number; unique_aircraft: number;
    operators: number; countries: number; avg_altitude_ft: number | null;
  }>(`SELECT
      COUNT(*) as total_events,
      COUNT(DISTINCT hex) as unique_aircraft,
      COUNT(DISTINCT operator) as operators,
      COUNT(DISTINCT country) as countries,
      ROUND(AVG(altitude_ft)) as avg_altitude_ft
    FROM flights WHERE user_id = ?`, [userId]);

  // 24-hour window
  const row24h = get<{
    events: number; aircraft: number; operators: number; gov_count: number;
  }>(`SELECT
      COUNT(*) as events,
      COUNT(DISTINCT hex) as aircraft,
      COUNT(DISTINCT operator) as operators,
      SUM(CASE WHEN classification IN ('government','military') THEN 1 ELSE 0 END) as gov_count
    FROM flights WHERE user_id = ? AND last_seen >= ?`, [userId, cutoff24h]);

  // Classification breakdown
  const classRows = all<{
    classification: string; total_count: number; unique_aircraft: number;
    avg_altitude: number | null; count_24h: number;
  }>(`SELECT
      classification,
      COUNT(*) as total_count,
      COUNT(DISTINCT hex) as unique_aircraft,
      ROUND(AVG(altitude_ft)) as avg_altitude,
      SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END) as count_24h
    FROM flights WHERE user_id = ? GROUP BY classification ORDER BY total_count DESC`,
    [cutoff24h, userId]);

  // Altitude distribution
  const altRows = all<{ band: string; count: number; sort_order: number }>(`
    SELECT
      CASE
        WHEN altitude_ft IS NULL OR altitude_ft < 1000  THEN 'Ground / VFR'
        WHEN altitude_ft < 10000 THEN '1k – 10k ft'
        WHEN altitude_ft < 25000 THEN '10k – 25k ft'
        WHEN altitude_ft < 40000 THEN '25k – 40k ft'
        ELSE '40k+ ft'
      END as band,
      COUNT(*) as count,
      CASE
        WHEN altitude_ft IS NULL OR altitude_ft < 1000  THEN 0
        WHEN altitude_ft < 10000 THEN 1
        WHEN altitude_ft < 25000 THEN 2
        WHEN altitude_ft < 40000 THEN 3
        ELSE 4
      END as sort_order
    FROM flights WHERE user_id = ? GROUP BY band ORDER BY sort_order`, [userId]);

  // Hourly activity — extract hour from ISO string (pos 12-13 in "YYYY-MM-DDTHH:...")
  const hourRows = all<{ hour: number; events: number }>(`
    SELECT
      CAST(substr(last_seen, 12, 2) AS INTEGER) as hour,
      COUNT(*) as events
    FROM flights WHERE user_id = ? AND last_seen >= ?
    GROUP BY substr(last_seen, 12, 2)
    ORDER BY hour`, [userId, cutoff24h]);

  // Weekly activity
  const weekRows = all<{ day_name: string; day_num: number; events: number }>(`
    SELECT
      CASE strftime('%w', substr(last_seen,1,10))
        WHEN '0' THEN 'Sun' WHEN '1' THEN 'Mon' WHEN '2' THEN 'Tue'
        WHEN '3' THEN 'Wed' WHEN '4' THEN 'Thu' WHEN '5' THEN 'Fri'
        ELSE 'Sat'
      END as day_name,
      CAST(strftime('%w', substr(last_seen,1,10)) AS INTEGER) as day_num,
      COUNT(*) as events
    FROM flights WHERE user_id = ? AND last_seen >= ?
    GROUP BY strftime('%w', substr(last_seen,1,10))
    ORDER BY day_num`, [userId, cutoff7d]);

  // Top aircraft types
  const typeRows = all<{
    aircraft_type: string; manufacturer: string | null;
    event_count: number; unique_aircraft: number;
  }>(`SELECT aircraft_type, MAX(manufacturer) as manufacturer,
      COUNT(*) as event_count, COUNT(DISTINCT hex) as unique_aircraft
    FROM flights WHERE user_id = ? AND aircraft_type IS NOT NULL
    GROUP BY aircraft_type ORDER BY event_count DESC LIMIT 15`, [userId]);

  // Top operators
  const operatorRows = all<{
    operator: string; event_count: number;
    unique_aircraft: number; top_classification: string;
  }>(`SELECT operator,
      COUNT(*) as event_count,
      COUNT(DISTINCT hex) as unique_aircraft,
      MAX(classification) as top_classification
    FROM flights WHERE user_id = ? AND operator IS NOT NULL
    GROUP BY operator ORDER BY event_count DESC LIMIT 10`, [userId]);

  // Top countries
  const countryRows = all<{
    country: string; country_iso: string | null;
    event_count: number; unique_aircraft: number;
  }>(`SELECT country, MAX(country_iso) as country_iso,
      COUNT(*) as event_count, COUNT(DISTINCT hex) as unique_aircraft
    FROM flights WHERE user_id = ? AND country IS NOT NULL
    GROUP BY country ORDER BY event_count DESC LIMIT 15`, [userId]);

  // Top routes
  const routeRows = all<{
    origin_iata: string; origin_city: string | null;
    destination_iata: string; destination_city: string | null;
    event_count: number;
  }>(`SELECT origin_iata,
      MAX(origin_city) as origin_city,
      destination_iata,
      MAX(destination_city) as destination_city,
      COUNT(*) as event_count
    FROM flights
    WHERE user_id = ? AND origin_iata IS NOT NULL AND destination_iata IS NOT NULL
    GROUP BY origin_iata, destination_iata
    ORDER BY event_count DESC LIMIT 12`, [userId]);

  // Recent notable — gov/mil or frequently seen
  const notableRows = all<FlightRow>(`
    SELECT * FROM flights
    WHERE user_id = ? AND (classification IN ('government','military') OR times_seen >= 5)
    ORDER BY last_seen DESC LIMIT 20`, [userId]);

  // Most seen aircraft (grouped by hex across all events)
  const mostSeenRows = all<{
    hex: string; registration: string | null; callsign: string | null;
    aircraft_type: string | null; manufacturer: string | null;
    operator: string | null; country: string | null;
    max_times_seen: number; event_count: number;
    first_seen_ever: string; last_seen_ever: string; classification: string;
  }>(`SELECT hex,
      MAX(registration) as registration,
      MAX(callsign) as callsign,
      MAX(aircraft_type) as aircraft_type,
      MAX(manufacturer) as manufacturer,
      MAX(operator) as operator,
      MAX(country) as country,
      MAX(times_seen) as max_times_seen,
      COUNT(*) as event_count,
      MIN(first_seen) as first_seen_ever,
      MAX(last_seen) as last_seen_ever,
      MAX(classification) as classification
    FROM flights WHERE user_id = ? GROUP BY hex
    ORDER BY max_times_seen DESC LIMIT 20`, [userId]);

  return {
    summary: {
      totalEvents:   summaryRow?.total_events   ?? 0,
      uniqueAircraft: summaryRow?.unique_aircraft ?? 0,
      operators:     summaryRow?.operators       ?? 0,
      countries:     summaryRow?.countries       ?? 0,
      avgAltitudeFt: summaryRow?.avg_altitude_ft ?? null,
    },
    summary24h: {
      events:   row24h?.events    ?? 0,
      aircraft: row24h?.aircraft  ?? 0,
      operators: row24h?.operators ?? 0,
      govCount: row24h?.gov_count ?? 0,
    },
    classification: classRows.map((r) => ({
      classification: r.classification,
      totalCount:     r.total_count,
      uniqueAircraft: r.unique_aircraft,
      avgAltitude:    r.avg_altitude,
      count24h:       r.count_24h,
    })),
    altitudeDistribution: altRows.map((r) => ({ band: r.band, count: r.count })),
    hourlyActivity: hourRows.map((r) => ({ hour: r.hour, events: r.events })),
    weeklyActivity: weekRows.map((r) => ({ dayName: r.day_name, dayNum: r.day_num, events: r.events })),
    topAircraftTypes: typeRows.map((r) => ({
      aircraftType:   r.aircraft_type,
      manufacturer:   r.manufacturer,
      eventCount:     r.event_count,
      uniqueAircraft: r.unique_aircraft,
    })),
    topOperators: operatorRows.map((r) => ({
      operator:          r.operator,
      eventCount:        r.event_count,
      uniqueAircraft:    r.unique_aircraft,
      topClassification: r.top_classification,
    })),
    topCountries: countryRows.map((r) => ({
      country:        r.country,
      countryIso:     r.country_iso,
      eventCount:     r.event_count,
      uniqueAircraft: r.unique_aircraft,
    })),
    topRoutes: routeRows.map((r) => ({
      originIata:       r.origin_iata,
      originCity:       r.origin_city,
      destinationIata:  r.destination_iata,
      destinationCity:  r.destination_city,
      eventCount:       r.event_count,
    })),
    recentNotable:    notableRows.map(rowToFlight),
    mostSeenAircraft: mostSeenRows.map((r) => ({
      hex:            r.hex,
      registration:   r.registration,
      callsign:       r.callsign,
      aircraftType:   r.aircraft_type,
      manufacturer:   r.manufacturer,
      operator:       r.operator,
      country:        r.country,
      maxTimesSeen:   r.max_times_seen,
      eventCount:     r.event_count,
      firstSeenEver:  r.first_seen_ever,
      lastSeenEver:   r.last_seen_ever,
      classification: r.classification,
    })),
  };
}

// ── Session stats ────────────────────────────────────────────────────────────

export function getSessionStats(userId: number) {
  const totalRow = get<{ count: number }>('SELECT COUNT(*) as count FROM flights WHERE user_id = ?', [userId]);
  const uniqueRow = get<{ count: number }>('SELECT COUNT(DISTINCT hex) as count FROM flights WHERE user_id = ?', [userId]);

  const classRows = all<{ classification: string; count: number }>(
    'SELECT classification, COUNT(*) as count FROM flights WHERE user_id = ? GROUP BY classification',
    [userId],
  );
  const classCounts = { commercial: 0, private: 0, cargo: 0, government: 0 };
  for (const row of classRows) {
    const k = row.classification as keyof typeof classCounts;
    if (k in classCounts) classCounts[k] = row.count;
  }

  const topRows = all<{ aircraft_type: string; count: number }>(
    `SELECT aircraft_type, COUNT(*) as count FROM flights
     WHERE user_id = ? AND aircraft_type IS NOT NULL
     GROUP BY aircraft_type ORDER BY count DESC LIMIT 5`,
    [userId],
  );

  return {
    totalDetected: totalRow?.count ?? 0,
    uniqueAircraft: uniqueRow?.count ?? 0,
    classification: classCounts,
    topAircraft: topRows.map((r) => ({ type: r.aircraft_type, count: r.count })),
  };
}
