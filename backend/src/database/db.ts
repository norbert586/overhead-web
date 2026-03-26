import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../../data/overhead.db');

let _db: Database | null = null;

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }
}

function db(): Database {
  if (!_db) throw new Error('Database not initialized — call initDb() first');
  return _db;
}

function persist(): void {
  const data = db().export();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/** Run a write statement (INSERT / UPDATE / DELETE / DDL) */
export function run(sql: string, params: (string | number | null)[] = []): void {
  db().run(sql, params);
  persist();
}

/** Execute raw SQL with no params (for migrations) */
export function exec(sql: string): void {
  db().exec(sql);
  persist();
}

/** Return a single row as a plain object, or undefined */
export function get<T extends Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): T | undefined {
  const stmt = db().prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject() as T;
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

/** Return all matching rows as plain objects */
export function all<T extends Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): T[] {
  const stmt = db().prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}
