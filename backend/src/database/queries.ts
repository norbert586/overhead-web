import { run, get, all } from './db';
import { logger } from '../logger';
import type { Flight, InterestTier } from '../types/flight';
import { scoreFlight, tierFor } from '../services/interestScore';
import { analyseTrajectory, type TrackPoint } from '../services/trajectoryAnalysis';
import { isNightAt } from '../services/solar';

const log = logger.child({ module: 'db' });

// ── User management ──────────────────────────────────────────────────────────

interface UserRow extends Record<string, unknown> {
  id: number;
  email: string;
  password_hash: string;
  invite_code: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  radius_nm: number | null;
  poll_interval_sec: number | null;
  is_admin: number | null;
  email_verified_at: string | null;
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

export function setUserPasswordHash(userId: number, passwordHash: string): void {
  run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

// ── Password reset + email verification tokens ──────────────────────────────
// We always store the SHA-256 hash of the plaintext token, never the token
// itself. The plaintext only travels via email; if the DB leaks, the leaked
// hashes can't be replayed against the reset/verify endpoints.

interface TokenRow extends Record<string, unknown> {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export function createPasswordResetToken(
  userId: number,
  tokenHash: string,
  expiresAt: string,
): void {
  run(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt],
  );
}

export function findActivePasswordResetToken(tokenHash: string): TokenRow | null {
  return get<TokenRow>(
    `SELECT * FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
    [tokenHash, new Date().toISOString()],
  ) ?? null;
}

export function markPasswordResetTokenUsed(id: number): void {
  run(
    'UPDATE password_reset_tokens SET used_at = ? WHERE id = ?',
    [new Date().toISOString(), id],
  );
}

// Invalidate any outstanding reset tokens for the user. Called after a
// successful reset so a leaked second link from the same batch can't also
// be redeemed.
export function invalidateUserPasswordResetTokens(userId: number): void {
  run(
    `UPDATE password_reset_tokens SET used_at = ?
      WHERE user_id = ? AND used_at IS NULL`,
    [new Date().toISOString(), userId],
  );
}

export function createEmailVerificationToken(
  userId: number,
  tokenHash: string,
  expiresAt: string,
): void {
  run(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt],
  );
}

export function findActiveEmailVerificationToken(tokenHash: string): TokenRow | null {
  return get<TokenRow>(
    `SELECT * FROM email_verification_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
    [tokenHash, new Date().toISOString()],
  ) ?? null;
}

export function markEmailVerificationTokenUsed(id: number): void {
  run(
    'UPDATE email_verification_tokens SET used_at = ? WHERE id = ?',
    [new Date().toISOString(), id],
  );
}

export function markEmailVerified(userId: number): void {
  run(
    'UPDATE users SET email_verified_at = ? WHERE id = ?',
    [new Date().toISOString(), userId],
  );
}

export interface UserSettings {
  latitude: number | null;
  longitude: number | null;
  radiusNm: number;
  pollIntervalSec: number;
}

export function getUserSettings(userId: number): UserSettings | null {
  const row = get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
  if (!row) return null;
  return {
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    radiusNm: row.radius_nm ?? 25,
    pollIntervalSec: row.poll_interval_sec ?? 12,
  };
}

export function updateUserSettings(userId: number, s: UserSettings): void {
  run(
    `UPDATE users SET latitude = ?, longitude = ?, radius_nm = ?, poll_interval_sec = ? WHERE id = ?`,
    [s.latitude, s.longitude, s.radiusNm, s.pollIntervalSec, userId],
  );
}

export interface UserLocation {
  id: number;
  latitude: number;
  longitude: number;
  radiusNm: number;
}

export function getAllUsersWithLocation(): UserLocation[] {
  return all<{ id: number; latitude: number; longitude: number; radius_nm: number }>(
    'SELECT id, latitude, longitude, radius_nm FROM users WHERE latitude IS NOT NULL AND longitude IS NOT NULL',
    [],
  ).map((row) => ({
    id:        row.id,
    latitude:  row.latitude,
    longitude: row.longitude,
    radiusNm:  row.radius_nm ?? 25,
  }));
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
  squawk: string | null;
  emergency: string | null;
  baro_rate_fpm: number | null;
  category: string | null;
  mlat: number | null;
  interest_score: number | null;
  interest_tier: string | null;
  interest_reasons: string | null; // JSON string
}

function parseReasons(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === 'string') : [];
  } catch {
    return [];
  }
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
    squawk:      row.squawk ?? null,
    emergency:   row.emergency ?? null,
    baroRateFpm: row.baro_rate_fpm ?? null,
    category:    row.category ?? null,
    mlat:        !!row.mlat,
    interestScore:   row.interest_score ?? 0,
    interestTier:    (row.interest_tier as InterestTier) ?? 'routine',
    interestReasons: parseReasons(row.interest_reasons),
  };
}

// ── Personal-rarity helpers (used by the scoring engine on every event) ─────

function countPersonalTypeSightings(userId: number, typeCode: string | null): number | null {
  if (!typeCode) return null;
  const row = get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM flights WHERE user_id = ? AND aircraft_type = ?',
    [userId, typeCode],
  );
  return row?.count ?? 0;
}

function isFirstOperatorForUser(userId: number, operator: string | null, excludeHex: string): boolean {
  if (!operator) return false;
  const row = get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM flights WHERE user_id = ? AND operator = ? AND hex != ?',
    [userId, operator, excludeHex],
  );
  return (row?.count ?? 0) === 0;
}

// Distinct (origin, dest) sightings for this user — excludes the current row
// (matched by hex) so the very event we're scoring doesn't count itself.
function countPersonalRouteSightings(
  userId: number,
  originIata: string | null,
  destinationIata: string | null,
  excludeHex: string,
): number | null {
  if (!originIata || !destinationIata) return null;
  const row = get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM flights
       WHERE user_id = ?
         AND origin_iata = ?
         AND destination_iata = ?
         AND hex != ?`,
    [userId, originIata, destinationIata, excludeHex],
  );
  return row?.count ?? 0;
}

// If an aircraft reappears after this gap it counts as a new visit
const EVENT_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

// Inputs the scanner now passes alongside the persisted flight fields. These
// raw signals come straight off the adsb.lol payload and are stored on every
// event for use by the scoring engine and any future trajectory features.
export interface RawEventSignals {
  squawk: string | null;
  emergency: string | null;
  baroRateFpm: number | null;
  category: string | null;
  mlat: boolean;
}

// Position for the per-scan track. lat/lon may be missing on some events
// (e.g. MLAT-only with stale fix) — in which case the track row is skipped.
export interface EventPosition {
  lat: number | null;
  lon: number | null;
}

// Trajectory window pulled before scoring. Keeps the last N positions and
// the most recent timestamp; older positions are kept on disk but ignored
// by the detectors (analyseTrajectory does its own time-window cut).
const TRACK_LOOKBACK = 60; // ~12 min at 12s scans — enough for any window

// Per-flight cap on persisted track points. ~40 min of history at 12s scans.
// Older points are pruned on insert. The pattern detectors only look at the
// last 6 min, so this is generous headroom without unbounded growth.
const TRACK_KEEP_PER_FLIGHT = 200;

function getRecentTrack(flightId: number): TrackPoint[] {
  const rows = all<{
    ts: string;
    lat: number;
    lon: number;
    altitude_ft: number | null;
    speed_kts: number | null;
    bearing_deg: number | null;
  }>(
    `SELECT ts, lat, lon, altitude_ft, speed_kts, bearing_deg
       FROM flight_track
      WHERE flight_id = ?
      ORDER BY ts DESC
      LIMIT ?`,
    [flightId, TRACK_LOOKBACK],
  );
  // Re-order oldest→newest for the pattern detectors.
  return rows.reverse().map((r) => ({
    ts:         r.ts,
    lat:        r.lat,
    lon:        r.lon,
    altitudeFt: r.altitude_ft,
    speedKts:   r.speed_kts,
    bearingDeg: r.bearing_deg,
  }));
}

function insertTrackPoint(
  flightId: number,
  ts: string,
  position: EventPosition,
  signals: RawEventSignals,
  altitudeFt: number | null,
  speedKts: number | null,
  bearingDeg: number | null,
): void {
  if (position.lat == null || position.lon == null) return;
  run(
    `INSERT INTO flight_track
       (flight_id, ts, lat, lon, altitude_ft, speed_kts, bearing_deg,
        baro_rate_fpm, squawk)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      flightId, ts, position.lat, position.lon,
      altitudeFt, speedKts, bearingDeg,
      signals.baroRateFpm, signals.squawk,
    ],
  );
  // Keep only the most recent TRACK_KEEP_PER_FLIGHT rows per flight. The
  // NOT IN subquery picks the keepers by id; everything else gets deleted.
  // Cheap at our scale — flights with >200 rows are uncommon and the index
  // on (flight_id, ts DESC) keeps both halves of the query fast.
  run(
    `DELETE FROM flight_track
       WHERE flight_id = ?
         AND id NOT IN (
           SELECT id FROM flight_track
            WHERE flight_id = ?
            ORDER BY ts DESC
            LIMIT ?
         )`,
    [flightId, flightId, TRACK_KEEP_PER_FLIGHT],
  );
}

/**
 * Upsert logic — one row per unique aircraft (hex + user_id).
 *
 * Within the 20-min window  → update telemetry only, times_seen stays the same
 * Beyond the 20-min window  → update telemetry + increment times_seen
 * Never seen before         → insert with times_seen = 1
 *
 * Interest score is computed on every event and stored monotonically — a
 * flight's score never decreases between events, so a single emergency squawk
 * keeps it surfaced even if the next sweep is back to normal telemetry.
 */
export function upsertFlight(
  flight: Omit<Flight,
    | 'timesSeen' | 'firstSeen' | 'lastSeen'
    | 'squawk' | 'emergency' | 'baroRateFpm' | 'category' | 'mlat'
    | 'interestScore' | 'interestTier' | 'interestReasons'>,
  signals: RawEventSignals,
  position: EventPosition,
  userId: number,
): Flight {
  const now = new Date().toISOString();

  // One canonical record per aircraft per user, keyed by hex
  const existing = get<FlightRow & { id: number }>(
    'SELECT * FROM flights WHERE hex = ? AND user_id = ? ORDER BY last_seen DESC LIMIT 1',
    [flight.hex, userId],
  );

  // ── Trajectory analysis (only meaningful when we have prior positions) ───
  // Runs against the stored track for this flight row; for brand-new flights
  // there's no track yet so the analysis is an empty score=0.
  const track = existing ? getRecentTrack(existing.id) : [];
  const traj  = analyseTrajectory(track, flight.originIata, flight.destinationIata);

  // ── Score this event ───────────────────────────────────────────────────────
  // Personal rarity is computed before the upsert so "first time" detection
  // doesn't race against the row we're about to write.
  const personalTypeSightings = countPersonalTypeSightings(userId, flight.aircraftType);
  const personalRouteSightings = countPersonalRouteSightings(
    userId, flight.originIata, flight.destinationIata, flight.hex);
  const score = scoreFlight({
    classification: flight.classification,
    hex:            flight.hex,
    callsign:       flight.callsign,
    typeCode:       flight.aircraftType,
    originIata:     flight.originIata,
    destinationIata: flight.destinationIata,
    altitudeFt:     flight.altitudeFt,
    speedKts:       flight.speedKts,
    baroRateFpm:    signals.baroRateFpm,
    distanceNm:     flight.distanceNm,
    category:       signals.category,
    squawk:         signals.squawk,
    emergency:      signals.emergency,
    mlat:           signals.mlat,
    // Night is computed at the aircraft's location at scan time. Falls back
    // to false when we have no fix (no harm — kinematic just won't add the
    // night-flight reason).
    isNight: (position.lat != null && position.lon != null)
      ? isNightAt(new Date(now), position.lat, position.lon)
      : false,
    personalTypeSightings,
    personalRouteSightings,
    isFirstHexForUser:      !existing,
    isFirstTypeForUser:     !!flight.aircraftType && (personalTypeSightings ?? 0) === 0,
    isFirstOperatorForUser: isFirstOperatorForUser(userId, flight.operator, flight.hex),
    isFirstRouteForUser:    personalRouteSightings === 0,
    trajectoryScore:        traj.score,
    trajectoryReasons:      traj.reasons,
  });

  if (existing) {
    const gapMs = Date.now() - new Date(existing.last_seen as string).getTime();
    const isNewVisit = gapMs > EVENT_WINDOW_MS;

    // Monotonic-only: keep the peak score across this aircraft's history.
    const prevScore = existing.interest_score ?? 0;
    const peakScore = Math.max(prevScore, score.score);
    const peakTier  = tierFor(peakScore);
    // When this event is what set the peak, use its reasons; otherwise keep
    // the stored ones. This avoids overwriting "Squawk 7700" from an earlier
    // event with a routine "rotorcraft" reason on the next sweep.
    const reasonsJson = score.score >= prevScore
      ? JSON.stringify(score.reasons)
      : existing.interest_reasons ?? JSON.stringify(score.reasons);

    log.debug({
      hex: flight.hex,
      event: isNewVisit ? 'new_visit' : 'update',
      gapSec: Math.round(gapMs / 1000),
      timesSeen: existing.times_seen as number,
      interest: peakScore,
      tier: peakTier,
    }, 'upsert flight');

    run(
      `UPDATE flights SET
        times_seen       = times_seen + ?,
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
        photo_url        = COALESCE(?, photo_url),
        origin_iata      = COALESCE(?, origin_iata),
        origin_city      = COALESCE(?, origin_city),
        origin_country   = COALESCE(?, origin_country),
        destination_iata = COALESCE(?, destination_iata),
        destination_city = COALESCE(?, destination_city),
        destination_country = COALESCE(?, destination_country),
        squawk           = ?,
        emergency        = ?,
        baro_rate_fpm    = ?,
        category         = COALESCE(?, category),
        mlat             = ?,
        interest_score   = ?,
        interest_tier    = ?,
        interest_reasons = ?
      WHERE id = ?`,
      [
        isNewVisit ? 1 : 0,
        flight.altitudeFt, flight.speedKts, flight.bearingDeg, flight.distanceNm,
        flight.classification, now,
        flight.manufacturer, flight.owner, flight.operator,
        flight.country, flight.countryIso,
        flight.photoUrl,
        flight.originIata, flight.originCity, flight.originCountry,
        flight.destinationIata, flight.destinationCity, flight.destinationCountry,
        signals.squawk, signals.emergency, signals.baroRateFpm,
        signals.category, signals.mlat ? 1 : 0,
        peakScore, peakTier, reasonsJson,
        existing.id as number,
      ],
    );
  } else {
    // Brand new aircraft — never seen before
    log.debug({
      hex: flight.hex, event: 'insert',
      interest: score.score, tier: score.tier,
    }, 'upsert flight (first time)');
    run(
      `INSERT INTO flights (
        user_id, hex, registration, callsign, aircraft_type, manufacturer,
        owner, operator, country, country_iso, photo_url,
        origin_iata, origin_city, origin_country,
        destination_iata, destination_city, destination_country,
        altitude_ft, speed_kts, bearing_deg, distance_nm,
        classification, times_seen, first_seen, last_seen,
        squawk, emergency, baro_rate_fpm, category, mlat,
        interest_score, interest_tier, interest_reasons
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId, flight.hex, flight.registration, flight.callsign, flight.aircraftType,
        flight.manufacturer, flight.owner, flight.operator, flight.country, flight.countryIso,
        flight.photoUrl,
        flight.originIata, flight.originCity, flight.originCountry,
        flight.destinationIata, flight.destinationCity, flight.destinationCountry,
        flight.altitudeFt, flight.speedKts, flight.bearingDeg, flight.distanceNm,
        flight.classification, 1, now, now,
        signals.squawk, signals.emergency, signals.baroRateFpm,
        signals.category, signals.mlat ? 1 : 0,
        score.score, score.tier, JSON.stringify(score.reasons),
      ],
    );
  }

  const saved = get<FlightRow & { id: number }>(
    'SELECT * FROM flights WHERE hex = ? AND user_id = ? ORDER BY last_seen DESC LIMIT 1',
    [flight.hex, userId],
  );
  if (!saved) {
    log.error({ hex: flight.hex }, 'upsert: SELECT after write returned nothing');
    // Synthesised fallback so callers always get a valid Flight object.
    return {
      ...flight,
      timesSeen: 1,
      firstSeen: now,
      lastSeen:  now,
      squawk:      signals.squawk,
      emergency:   signals.emergency,
      baroRateFpm: signals.baroRateFpm,
      category:    signals.category,
      mlat:        signals.mlat,
      interestScore:   score.score,
      interestTier:    score.tier,
      interestReasons: score.reasons,
    } as Flight;
  }

  // ── Append the new track point ──────────────────────────────────────────
  // Done after upsert so we have a valid flight_id. The point we just inserted
  // does not affect this event's score (it's analysed against the *prior*
  // track); patterns develop and surface on the next event.
  insertTrackPoint(
    saved.id, now, position, signals,
    flight.altitudeFt, flight.speedKts, flight.bearingDeg,
  );

  return rowToFlight(saved);
}

export function getLastKnownFlight(userId: number): Flight | null {
  const row = get<FlightRow>(
    'SELECT * FROM flights WHERE user_id = ? ORDER BY last_seen DESC LIMIT 1',
    [userId],
  );
  return row ? rowToFlight(row) : null;
}

export function getFlightHistory(hex: string, userId: number) {
  return get<{ hex: string; times_seen: number; first_seen: string; last_seen: string }>(
    'SELECT hex, times_seen, first_seen, last_seen FROM flights WHERE hex = ? AND user_id = ?',
    [hex, userId],
  );
}

export function getLog(
  limit: number,
  offset: number,
  userId: number,
  fromDate?: string,
  toDate?: string,
): { flights: Flight[]; total: number } {
  const conds: string[] = ['user_id = ?'];
  const base: (string | number)[] = [userId];

  if (fromDate) { conds.push('last_seen >= ?'); base.push(fromDate); }
  if (toDate)   { conds.push('last_seen <= ?'); base.push(toDate);   }

  const where = conds.join(' AND ');
  const rows = all<FlightRow>(
    `SELECT * FROM flights WHERE ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`,
    [...base, limit, offset],
  );
  const countRow = get<{ count: number }>(
    `SELECT COUNT(*) as count FROM flights WHERE ${where}`,
    base,
  );
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

// Last-resort photo fallback: any aircraft of the same ICAO type that we've
// already seen and have a photo for. Pulls from aircraft_cache first (richer,
// shared across users) and falls back to flights so a brand-new install still
// has something the moment it's seen one airframe of the type.
export interface PhotoByTypeRow extends Record<string, unknown> {
  registration: string | null;
  photo_url: string;
}

export function findPhotoByType(
  aircraftType: string,
  excludeRegistration: string | null,
): { photoUrl: string; registration: string | null } | null {
  const exclude = excludeRegistration ?? '';
  const cacheRow = get<PhotoByTypeRow>(
    `SELECT registration, photo_url
       FROM aircraft_cache
      WHERE aircraft_type = ?
        AND photo_url IS NOT NULL
        AND photo_url != ''
        AND registration != ?
      ORDER BY cached_at DESC
      LIMIT 1`,
    [aircraftType, exclude],
  );
  if (cacheRow) return { photoUrl: cacheRow.photo_url, registration: cacheRow.registration };

  const flightRow = get<PhotoByTypeRow>(
    `SELECT registration, photo_url
       FROM flights
      WHERE aircraft_type = ?
        AND photo_url IS NOT NULL
        AND photo_url != ''
        AND (registration IS NULL OR registration != ?)
      ORDER BY last_seen DESC
      LIMIT 1`,
    [aircraftType, exclude],
  );
  if (flightRow) return { photoUrl: flightRow.photo_url, registration: flightRow.registration };

  return null;
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

  // Recent notable — anything the scoring engine flagged as interesting+
  const notableRows = all<FlightRow>(`
    SELECT * FROM flights
    WHERE user_id = ? AND interest_score >= 50
    ORDER BY interest_score DESC, last_seen DESC LIMIT 20`, [userId]);

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

// ── Individual stats endpoints ────────────────────────────────────────────────

export function getStatsSummary(userId: number) {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const summaryRow = get<{
    total_events: number; unique_aircraft: number;
    operators: number; countries: number; avg_altitude_ft: number | null;
  }>(`SELECT COUNT(*) as total_events, COUNT(DISTINCT hex) as unique_aircraft,
      COUNT(DISTINCT operator) as operators, COUNT(DISTINCT country) as countries,
      ROUND(AVG(altitude_ft)) as avg_altitude_ft
    FROM flights WHERE user_id = ?`, [userId]);

  const row24h = get<{
    events: number; aircraft: number; operators: number; gov_count: number;
  }>(`SELECT COUNT(*) as events, COUNT(DISTINCT hex) as aircraft,
      COUNT(DISTINCT operator) as operators,
      SUM(CASE WHEN classification IN ('government','military') THEN 1 ELSE 0 END) as gov_count
    FROM flights WHERE user_id = ? AND last_seen >= ?`, [userId, cutoff24h]);

  const classRows = all<{
    classification: string; total_count: number; unique_aircraft: number;
    avg_altitude: number | null; count_24h: number;
  }>(`SELECT classification, COUNT(*) as total_count, COUNT(DISTINCT hex) as unique_aircraft,
      ROUND(AVG(altitude_ft)) as avg_altitude,
      SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END) as count_24h
    FROM flights WHERE user_id = ? GROUP BY classification ORDER BY total_count DESC`,
    [cutoff24h, userId]);

  return {
    summary: {
      totalEvents:    summaryRow?.total_events    ?? 0,
      uniqueAircraft: summaryRow?.unique_aircraft ?? 0,
      operators:      summaryRow?.operators       ?? 0,
      countries:      summaryRow?.countries       ?? 0,
      avgAltitudeFt:  summaryRow?.avg_altitude_ft ?? null,
    },
    summary24h: {
      events:    row24h?.events    ?? 0,
      aircraft:  row24h?.aircraft  ?? 0,
      operators: row24h?.operators ?? 0,
      govCount:  row24h?.gov_count ?? 0,
    },
    classification: classRows.map((r) => ({
      classification: r.classification,
      totalCount:     r.total_count,
      uniqueAircraft: r.unique_aircraft,
      avgAltitude:    r.avg_altitude,
      count24h:       r.count_24h,
    })),
  };
}

export function getStatsAltitude(userId: number) {
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

  return { altitudeDistribution: altRows.map((r) => ({ band: r.band, count: r.count })) };
}

export function getStatsActivity(userId: number) {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

  const hourRows = all<{ hour: number; events: number }>(`
    SELECT CAST(substr(last_seen, 12, 2) AS INTEGER) as hour, COUNT(*) as events
    FROM flights WHERE user_id = ? AND last_seen >= ?
    GROUP BY substr(last_seen, 12, 2) ORDER BY hour`, [userId, cutoff24h]);

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
    GROUP BY strftime('%w', substr(last_seen,1,10)) ORDER BY day_num`, [userId, cutoff7d]);

  return {
    hourlyActivity: hourRows.map((r) => ({ hour: r.hour, events: r.events })),
    weeklyActivity: weekRows.map((r) => ({ dayName: r.day_name, dayNum: r.day_num, events: r.events })),
  };
}

export function getStatsAircraftTypes(userId: number) {
  const typeRows = all<{
    aircraft_type: string; manufacturer: string | null;
    event_count: number; unique_aircraft: number;
  }>(`SELECT aircraft_type, MAX(manufacturer) as manufacturer,
      COUNT(*) as event_count, COUNT(DISTINCT hex) as unique_aircraft
    FROM flights WHERE user_id = ? AND aircraft_type IS NOT NULL
    GROUP BY aircraft_type ORDER BY event_count DESC LIMIT 15`, [userId]);

  return {
    topAircraftTypes: typeRows.map((r) => ({
      aircraftType:   r.aircraft_type,
      manufacturer:   r.manufacturer,
      eventCount:     r.event_count,
      uniqueAircraft: r.unique_aircraft,
    })),
  };
}

export function getStatsOperators(userId: number) {
  const operatorRows = all<{
    operator: string; event_count: number;
    unique_aircraft: number; top_classification: string;
  }>(`SELECT operator, COUNT(*) as event_count, COUNT(DISTINCT hex) as unique_aircraft,
      MAX(classification) as top_classification
    FROM flights WHERE user_id = ? AND operator IS NOT NULL
    GROUP BY operator ORDER BY event_count DESC LIMIT 10`, [userId]);

  return {
    topOperators: operatorRows.map((r) => ({
      operator:          r.operator,
      eventCount:        r.event_count,
      uniqueAircraft:    r.unique_aircraft,
      topClassification: r.top_classification,
    })),
  };
}

export function getStatsCountries(userId: number) {
  const countryRows = all<{
    country: string; country_iso: string | null;
    event_count: number; unique_aircraft: number;
  }>(`SELECT country, MAX(country_iso) as country_iso,
      COUNT(*) as event_count, COUNT(DISTINCT hex) as unique_aircraft
    FROM flights WHERE user_id = ? AND country IS NOT NULL
    GROUP BY country ORDER BY event_count DESC LIMIT 15`, [userId]);

  return {
    topCountries: countryRows.map((r) => ({
      country:        r.country,
      countryIso:     r.country_iso,
      eventCount:     r.event_count,
      uniqueAircraft: r.unique_aircraft,
    })),
  };
}

export function getStatsRoutes(userId: number) {
  const routeRows = all<{
    origin_iata: string; origin_city: string | null;
    destination_iata: string; destination_city: string | null;
    event_count: number;
  }>(`SELECT origin_iata, MAX(origin_city) as origin_city,
      destination_iata, MAX(destination_city) as destination_city,
      COUNT(*) as event_count
    FROM flights
    WHERE user_id = ? AND origin_iata IS NOT NULL AND destination_iata IS NOT NULL
    GROUP BY origin_iata, destination_iata ORDER BY event_count DESC LIMIT 12`, [userId]);

  return {
    topRoutes: routeRows.map((r) => ({
      originIata:      r.origin_iata,
      originCity:      r.origin_city,
      destinationIata: r.destination_iata,
      destinationCity: r.destination_city,
      eventCount:      r.event_count,
    })),
  };
}

export function getStatsNotable(userId: number) {
  const notableRows = all<FlightRow>(`
    SELECT * FROM flights
    WHERE user_id = ? AND interest_score >= 50
    ORDER BY interest_score DESC, last_seen DESC LIMIT 20`, [userId]);

  return { recentNotable: notableRows.map(rowToFlight) };
}

export function getStatsMostSeen(userId: number) {
  const mostSeenRows = all<{
    hex: string; registration: string | null; callsign: string | null;
    aircraft_type: string | null; manufacturer: string | null;
    operator: string | null; country: string | null;
    max_times_seen: number; event_count: number;
    first_seen_ever: string; last_seen_ever: string; classification: string;
  }>(`SELECT hex, MAX(registration) as registration, MAX(callsign) as callsign,
      MAX(aircraft_type) as aircraft_type, MAX(manufacturer) as manufacturer,
      MAX(operator) as operator, MAX(country) as country,
      MAX(times_seen) as max_times_seen, COUNT(*) as event_count,
      MIN(first_seen) as first_seen_ever, MAX(last_seen) as last_seen_ever,
      MAX(classification) as classification
    FROM flights WHERE user_id = ? GROUP BY hex
    ORDER BY max_times_seen DESC LIMIT 20`, [userId]);

  return {
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

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: number;
  email: string;
  createdAt: string;
  isAdmin: boolean;
  hasLocation: boolean;
  totalFlights: number;
  uniqueAircraft: number;
  lastSeenAt: string | null;
}

export function listAdminUsers(): AdminUserRow[] {
  const rows = all<{
    id: number;
    email: string;
    created_at: string;
    is_admin: number | null;
    latitude: number | null;
    longitude: number | null;
    total_flights: number;
    unique_aircraft: number;
    last_seen_at: string | null;
  }>(
    `SELECT
       u.id,
       u.email,
       u.created_at,
       u.is_admin,
       u.latitude,
       u.longitude,
       COUNT(f.id)              AS total_flights,
       COUNT(DISTINCT f.hex)    AS unique_aircraft,
       MAX(f.last_seen)         AS last_seen_at
     FROM users u
     LEFT JOIN flights f ON f.user_id = u.id
     GROUP BY u.id
     ORDER BY u.created_at ASC`,
    [],
  );
  return rows.map((r) => ({
    id:             r.id,
    email:          r.email,
    createdAt:      r.created_at,
    isAdmin:        !!r.is_admin,
    hasLocation:    r.latitude !== null && r.longitude !== null,
    totalFlights:   r.total_flights ?? 0,
    uniqueAircraft: r.unique_aircraft ?? 0,
    lastSeenAt:     r.last_seen_at,
  }));
}

export interface AdminOverview {
  totalUsers: number;
  adminUsers: number;
  usersWithLocation: number;
  newUsers24h: number;
  newUsers7d: number;
  totalFlights: number;
  uniqueAircraftAllUsers: number;
  flights24h: number;
  cachedAircraft: number;
  cachedCallsigns: number;
}

export function getAdminOverview(): AdminOverview {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

  const userRow = get<{
    total: number; admins: number; located: number;
    new_24h: number; new_7d: number;
  }>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN is_admin = 1 THEN 1 ELSE 0 END) AS admins,
       SUM(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END) AS located,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_24h,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_7d
     FROM users`,
    [cutoff24h, cutoff7d],
  );

  const flightRow = get<{ total: number; unique_aircraft: number; recent: number }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT hex) AS unique_aircraft,
       SUM(CASE WHEN last_seen >= ? THEN 1 ELSE 0 END) AS recent
     FROM flights`,
    [cutoff24h],
  );

  const acRow = get<{ count: number }>(`SELECT COUNT(*) AS count FROM aircraft_cache`, []);
  const csRow = get<{ count: number }>(`SELECT COUNT(*) AS count FROM callsign_cache`, []);

  return {
    totalUsers:             userRow?.total       ?? 0,
    adminUsers:             userRow?.admins      ?? 0,
    usersWithLocation:      userRow?.located     ?? 0,
    newUsers24h:            userRow?.new_24h     ?? 0,
    newUsers7d:             userRow?.new_7d      ?? 0,
    totalFlights:           flightRow?.total           ?? 0,
    uniqueAircraftAllUsers: flightRow?.unique_aircraft ?? 0,
    flights24h:             flightRow?.recent          ?? 0,
    cachedAircraft:         acRow?.count         ?? 0,
    cachedCallsigns:        csRow?.count         ?? 0,
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
