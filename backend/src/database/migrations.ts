import { exec, run } from './db';

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

  // Add per-user location/scan settings
  try { exec(`ALTER TABLE users ADD COLUMN latitude REAL`); } catch { /* exists */ }
  try { exec(`ALTER TABLE users ADD COLUMN longitude REAL`); } catch { /* exists */ }
  try { exec(`ALTER TABLE users ADD COLUMN radius_nm INTEGER DEFAULT 25`); } catch { /* exists */ }
  try { exec(`ALTER TABLE users ADD COLUMN poll_interval_sec INTEGER DEFAULT 12`); } catch { /* exists */ }

  console.log('Migrations complete.');
}
