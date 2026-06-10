import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../../data/overhead.db');

let _db: Database.Database | null = null;

export async function initDb(): Promise<void> {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  // WAL keeps readers and the writer from blocking each other, and writes
  // touch only changed pages instead of rewriting the file. synchronous=NORMAL
  // is safe under WAL (durable to the last checkpoint on power loss, always
  // consistent) and avoids an fsync per transaction.
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');

  process.on('exit', () => {
    _db?.close();
  });
}

function db(): Database.Database {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

/** Run a write statement (INSERT / UPDATE / DELETE / DDL) */
export function run(sql: string, params: (string | number | null)[] = []): void {
  db().prepare(sql).run(params);
}

/**
 * Alias of run(). Kept for callers written against the sql.js layer, where
 * skipping the per-write disk flush mattered. better-sqlite3 writes pages
 * in place, so there is no flush to skip.
 */
export function runNoPersist(sql: string, params: (string | number | null)[] = []): void {
  run(sql, params);
}

/** Checkpoint the WAL into the main database file. */
export function flush(): void {
  db().pragma('wal_checkpoint(PASSIVE)');
}

/** Execute raw SQL with no params (for migrations; supports multiple statements) */
export function exec(sql: string): void {
  db().exec(sql);
}

/** Return a single row as a plain object, or undefined */
export function get<T extends Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): T | undefined {
  return db().prepare(sql).get(params) as T | undefined;
}

/** Return all matching rows as plain objects */
export function all<T extends Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): T[] {
  return db().prepare(sql).all(params) as T[];
}
