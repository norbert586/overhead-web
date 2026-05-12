import { exec, run, all, runNoPersist, flush } from './db';
import { logger } from '../logger';
import { scoreFlight } from '../services/interestScore';
import type { Classification } from '../types/flight';

const log = logger.child({ module: 'migrations' });

export function runMigrations(): void {
  // Core tables and safe indexes (no event_key yet)
  exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      invite_code  TEXT,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      event_key TEXT,
      hex TEXT NOT NULL,
      registration TEXT,
      callsign TEXT,
      aircraft_type TEXT,
      manufacturer TEXT,
      owner TEXT,
      operator TEXT,
      country TEXT,
      country_iso TEXT,
      origin_iata TEXT,
      origin_city TEXT,
      origin_country TEXT,
      destination_iata TEXT,
      destination_city TEXT,
      destination_country TEXT,
      altitude_ft INTEGER,
      speed_kts REAL,
      bearing_deg REAL,
      distance_nm REAL,
      classification TEXT DEFAULT 'unknown',
      times_seen INTEGER DEFAULT 1,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS aircraft_cache (
      registration TEXT PRIMARY KEY,
      aircraft_type TEXT,
      manufacturer TEXT,
      owner TEXT,
      country TEXT,
      country_iso TEXT,
      cached_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS callsign_cache (
      callsign TEXT PRIMARY KEY,
      operator TEXT,
      origin_iata TEXT,
      origin_city TEXT,
      origin_country TEXT,
      destination_iata TEXT,
      destination_city TEXT,
      destination_country TEXT,
      cached_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_flights_hex ON flights(hex);
    CREATE INDEX IF NOT EXISTS idx_flights_last_seen ON flights(last_seen);
    CREATE INDEX IF NOT EXISTS idx_flights_classification ON flights(classification);
  `);

  // Add event_key column if it exists on old DBs (no longer used, kept for compat)
  try {
    exec(`ALTER TABLE flights ADD COLUMN event_key TEXT`);
  } catch { /* column already exists — fine */ }

  // Add user_id column to existing DBs
  try {
    exec(`ALTER TABLE flights ADD COLUMN user_id INTEGER REFERENCES users(id)`);
  } catch { /* column already exists — fine */ }

  // Now safe to create the user_id index (column guaranteed to exist)
  try {
    exec(`CREATE INDEX IF NOT EXISTS idx_flights_user_id ON flights(user_id)`);
  } catch { /* already exists */ }

  // Assign all legacy rows (pre-auth) to user 1
  run(`UPDATE flights SET user_id = 1 WHERE user_id IS NULL`, []);

  // Add photo_url to aircraft_cache if missing
  try {
    exec(`ALTER TABLE aircraft_cache ADD COLUMN photo_url TEXT`);
  } catch { /* column already exists — fine */ }

  // Add photo_url to flights if missing (persists adsbdb photo URL per aircraft)
  try {
    exec(`ALTER TABLE flights ADD COLUMN photo_url TEXT`);
  } catch { /* column already exists — fine */ }

  // ── Phase 1 interest-score columns + raw event signals ────────────────────
  // Raw ADS-B fields we now persist (previously dropped at the type boundary)
  try { exec(`ALTER TABLE flights ADD COLUMN squawk TEXT`); } catch { /* exists */ }
  try { exec(`ALTER TABLE flights ADD COLUMN emergency TEXT`); } catch { /* exists */ }
  try { exec(`ALTER TABLE flights ADD COLUMN baro_rate_fpm INTEGER`); } catch { /* exists */ }
  try { exec(`ALTER TABLE flights ADD COLUMN category TEXT`); } catch { /* exists */ }
  try { exec(`ALTER TABLE flights ADD COLUMN mlat INTEGER DEFAULT 0`); } catch { /* exists */ }

  // Interest score is monotonic-only (peak score across the flight's life).
  // Tier is derived from score; reasons are a JSON-encoded string array.
  try { exec(`ALTER TABLE flights ADD COLUMN interest_score INTEGER DEFAULT 0`); } catch { /* exists */ }
  try { exec(`ALTER TABLE flights ADD COLUMN interest_tier TEXT DEFAULT 'routine'`); } catch { /* exists */ }
  try { exec(`ALTER TABLE flights ADD COLUMN interest_reasons TEXT`); } catch { /* exists */ }

  // Drives the new notable query and any "Interest >= X" filter.
  try { exec(`CREATE INDEX IF NOT EXISTS idx_flights_interest_score ON flights(interest_score)`); }
  catch { /* already exists */ }

  // Add per-user location/scan settings
  try { exec(`ALTER TABLE users ADD COLUMN latitude REAL`); } catch { /* exists */ }
  try { exec(`ALTER TABLE users ADD COLUMN longitude REAL`); } catch { /* exists */ }
  try { exec(`ALTER TABLE users ADD COLUMN radius_nm INTEGER DEFAULT 25`); } catch { /* exists */ }
  try { exec(`ALTER TABLE users ADD COLUMN poll_interval_sec INTEGER DEFAULT 12`); } catch { /* exists */ }

  // Admin flag — driven by the ADMIN_EMAILS env var (comma-separated).
  // Authoritative on every startup: emails in the list are admins, every
  // other user is demoted. If ADMIN_EMAILS is unset we leave the column
  // alone so misconfiguration (e.g. forgetting to copy .env) can't silently
  // strip admin from everyone.
  try { exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`); } catch { /* exists */ }
  syncAdminAllowlist();

  // Achievement + rank tables
  exec(`
    CREATE TABLE IF NOT EXISTS user_achievements (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      achievement_id TEXT NOT NULL,
      unlocked_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, achievement_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_achievements_user
      ON user_achievements(user_id);

    CREATE TABLE IF NOT EXISTS user_rank_cache (
      user_id     INTEGER PRIMARY KEY REFERENCES users(id),
      score       INTEGER NOT NULL DEFAULT 0,
      tier        TEXT    NOT NULL DEFAULT 'OBSERVER',
      computed_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // One-time pass: re-score flights still at the default score=0 so the
  // Notable carousel populates without waiting for fresh sightings. Idempotent:
  // re-running only touches rows whose score is still the schema default.
  backfillInterestScores();

  log.info('migrations complete');
}

interface BackfillRow extends Record<string, unknown> {
  id: number;
  hex: string;
  callsign: string | null;
  aircraft_type: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  altitude_ft: number | null;
  speed_kts: number | null;
  distance_nm: number | null;
  classification: string;
  squawk: string | null;
  emergency: string | null;
  baro_rate_fpm: number | null;
  category: string | null;
  mlat: number | null;
}

function backfillInterestScores(): void {
  // Only target rows that still have the default — never overwrite a real
  // score that may have come from a peak event (monotonic guarantee).
  const rows = all<BackfillRow>(
    `SELECT id, hex, callsign, aircraft_type, origin_iata, destination_iata,
            altitude_ft, speed_kts, distance_nm, classification,
            squawk, emergency, baro_rate_fpm, category, mlat
       FROM flights
      WHERE interest_score IS NULL OR interest_score = 0`,
    [],
  );
  if (rows.length === 0) return;

  let touched = 0;
  for (const r of rows) {
    // Personal-rarity inputs aren't reconstructable from a single row's data
    // without an O(N²) sweep, so we feed neutral values. Next live event for
    // each airframe will refresh those signals naturally.
    const s = scoreFlight({
      classification:  r.classification as Classification,
      hex:             r.hex,
      callsign:        r.callsign,
      typeCode:        r.aircraft_type,
      originIata:      r.origin_iata,
      destinationIata: r.destination_iata,
      altitudeFt:      r.altitude_ft,
      speedKts:        r.speed_kts,
      baroRateFpm:     r.baro_rate_fpm,
      distanceNm:      r.distance_nm,
      category:        r.category,
      squawk:          r.squawk,
      emergency:       r.emergency,
      mlat:            !!r.mlat,
      personalTypeSightings:  null,
      personalRouteSightings: null,
      isFirstHexForUser:      false,
      isFirstTypeForUser:     false,
      isFirstOperatorForUser: false,
      isFirstRouteForUser:    false,
    });
    if (s.score === 0) continue; // leave untouched, don't write zeros
    runNoPersist(
      `UPDATE flights
          SET interest_score = ?, interest_tier = ?, interest_reasons = ?
        WHERE id = ?`,
      [s.score, s.tier, JSON.stringify(s.reasons), r.id],
    );
    touched++;
  }
  if (touched > 0) flush();
  log.info({ scanned: rows.length, touched }, 'interest-score backfill complete');
}

function syncAdminAllowlist(): void {
  const raw = process.env.ADMIN_EMAILS ?? '';
  const emails = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    log.info('ADMIN_EMAILS not set — skipping admin allowlist sync');
    return;
  }

  const placeholders = emails.map(() => '?').join(',');
  run(`UPDATE users SET is_admin = 0 WHERE LOWER(email) NOT IN (${placeholders})`, emails);
  run(`UPDATE users SET is_admin = 1 WHERE LOWER(email) IN (${placeholders})`, emails);
  log.info({ emails }, 'admin allowlist applied');
}
