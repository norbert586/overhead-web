// In-memory diagnostics: what the server has seen lately, queryable without
// SSH or log grepping. Everything here is bounded ring buffers / fixed-size
// buckets, reset on restart — enough to answer "what's going wrong right
// now?" from the admin System tab or `GET /api/diagnostics`.
//
// Deliberately imports nothing from logger.ts: the logger feeds this module.

import type { Request, Response, NextFunction } from 'express';

// ── Recent warn/error log entries ───────────────────────────────────────────

export interface LogEntry {
  at: string;
  lastAt: string;
  count: number; // identical consecutive-ish entries are folded together
  level: 'warn' | 'error' | 'fatal';
  module: string | null;
  msg: string;
  detail: Record<string, unknown>;
}

const LOG_RING_SIZE = 200;
const LOG_DEDUPE_WINDOW = 20; // fold a repeat if it matches one of the last N
const logRing: LogEntry[] = [];

// Fields worth keeping from a log call. Anything else (full request objects,
// stacks) stays in the process logs.
const DETAIL_KEYS = ['provider', 'error', 'code', 'key', 'hex', 'registration', 'callsign',
  'status', 'ageMs', 'count', 'consecutiveTransient', 'signal', 'reqId'];

function levelName(level: number): LogEntry['level'] | null {
  if (level >= 60) return 'fatal';
  if (level >= 50) return 'error';
  if (level >= 40) return 'warn';
  return null;
}

/** Called from the pino logMethod hook for every log call. */
export function recordLogEntry(level: number, bindings: Record<string, unknown>, args: unknown[]): void {
  const lvl = levelName(level);
  if (!lvl) return;
  const obj = (typeof args[0] === 'object' && args[0] !== null ? args[0] : {}) as Record<string, unknown>;
  // Drop query strings: pino-http's message embeds the URL, and poll URLs
  // carry the user's coordinates.
  const msg = String(typeof args[0] === 'string' ? args[0] : args[1] ?? '')
    .replace(/\?\S*/g, '')
    .slice(0, 300);

  const detail: Record<string, unknown> = {};
  for (const k of DETAIL_KEYS) if (obj[k] !== undefined) detail[k] = obj[k];
  const err = obj.err;
  if (err instanceof Error) detail.err = `${err.name}: ${err.message}`.slice(0, 300);
  else if (err !== undefined) detail.err = String(err).slice(0, 300);
  // pino-http entries: keep method, path (never the query — it carries the
  // user's coordinates), status and request id. pino-http puts `req` in the
  // child logger's bindings rather than the call's object.
  const req = (obj.req ?? bindings.req) as { method?: string; url?: string; id?: unknown } | undefined;
  const res = obj.res as { statusCode?: number } | undefined;
  if (req?.method) detail.request = `${req.method} ${(req.url ?? '').split('?')[0]}`;
  if (req?.id !== undefined) detail.reqId = req.id;
  if (res?.statusCode) detail.status = res.statusCode;

  const module = typeof bindings.module === 'string' ? bindings.module : null;
  // Request-scoped messages embed the URL; fold them by route + status.
  const signature = `${lvl}|${module}|${detail.request ?? msg}|${detail.status ?? ''}|${detail.code ?? ''}|${detail.provider ?? ''}`;
  const now = new Date().toISOString();

  for (let i = logRing.length - 1; i >= Math.max(0, logRing.length - LOG_DEDUPE_WINDOW); i--) {
    const e = logRing[i];
    if (`${e.level}|${e.module}|${e.detail.request ?? e.msg}|${e.detail.status ?? ''}|${e.detail.code ?? ''}|${e.detail.provider ?? ''}` === signature) {
      e.count += 1;
      e.lastAt = now;
      e.detail = detail; // keep the latest specifics
      return;
    }
  }
  logRing.push({ at: now, lastAt: now, count: 1, level: lvl, module, msg, detail });
  if (logRing.length > LOG_RING_SIZE) logRing.shift();
}

// ── HTTP metrics: per-minute buckets for the last hour ──────────────────────

const BUCKET_MS = 60_000;
const BUCKET_COUNT = 60;

interface Bucket {
  minute: number; // epoch minute
  requests: Map<string, number>; // "GET /api/flights 200" → n
  errorCodes: Map<string, number>; // "auth_expired" → n
  polls: Map<string, number>; // poll outcome → n
}

const buckets: Bucket[] = [];

function currentBucket(): Bucket {
  const minute = Math.floor(Date.now() / BUCKET_MS);
  let b = buckets[buckets.length - 1];
  if (!b || b.minute !== minute) {
    b = { minute, requests: new Map(), errorCodes: new Map(), polls: new Map() };
    buckets.push(b);
    while (buckets.length > BUCKET_COUNT) buckets.shift();
  }
  return b;
}

// Keys are route patterns, so a handful per bucket — the cap only matters
// if something unexpected (a scanner, a bug) mints new labels.
const MAX_KEYS_PER_MAP = 200;

function bump(map: Map<string, number>, key: string): void {
  const k = map.has(key) || map.size < MAX_KEYS_PER_MAP ? key : 'other';
  map.set(k, (map.get(k) ?? 0) + 1);
}

// Poll latency samples (ms) for percentiles.
const LATENCY_SAMPLES = 500;
const pollLatencies: number[] = [];

// ── Poll outcomes: the last N /api/flights calls ────────────────────────────

export interface PollInfo {
  outcome?: string;
  areaSource?: string; // cache | shared | fetched | stale
  provider?: string | null;
  aircraftInArea?: number;
  inRange?: number;
  recorded?: number;
  matchedRadiusNm?: number;
  dataAgeSec?: number;
}

export interface PollRecord extends PollInfo {
  at: string;
  reqId: unknown;
  user: string; // "u12" | "guest" — no emails or coordinates here
  status: number;
  code: string | null;
  ms: number;
}

const POLL_RING_SIZE = 100;
const pollRing: PollRecord[] = [];

function routeLabel(req: Request): string {
  // The matched route *pattern* (/api/flights/:hex/history), never the raw
  // path — raw paths are unbounded (ids, scanners) and would bloat metrics.
  const pattern = req.route?.path as string | undefined;
  if (pattern === undefined) return `${req.method} (no route)`;
  const full = `${req.baseUrl}${pattern === '/' ? '' : pattern}`;
  return `${req.method} ${full || '/'}`;
}

/**
 * Records every request's route, status and error code into the per-minute
 * buckets, and /api/flights polls into the poll ring. Error codes are read
 * from the JSON body (`{ code }`) every error response already carries.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode >= 400 && body && typeof body === 'object' && 'code' in body) {
      res.locals.errorCode = String((body as { code: unknown }).code);
    }
    return json(body);
  };

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const b = currentBucket();
    const route = routeLabel(req);
    bump(b.requests, `${route} ${res.statusCode}`);
    const code = (res.locals.errorCode as string | undefined) ?? null;
    if (code) bump(b.errorCodes, code);

    if (route === 'GET /api/flights') {
      const info = (res.locals.poll ?? {}) as PollInfo;
      const outcome = info.outcome ?? code ?? (res.statusCode >= 400 ? `http_${res.statusCode}` : 'ok');
      bump(b.polls, outcome);
      pollLatencies.push(ms);
      if (pollLatencies.length > LATENCY_SAMPLES) pollLatencies.shift();
      pollRing.push({
        at: new Date().toISOString(),
        reqId: req.id,
        user: req.userId !== undefined ? `u${req.userId}` : 'guest',
        status: res.statusCode,
        code,
        ms: Math.round(ms),
        ...info,
        outcome,
      });
      if (pollRing.length > POLL_RING_SIZE) pollRing.shift();
    }
  });
  next();
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
}

function sumBuckets(pick: (b: Bucket) => Map<string, number>, sinceMinute: number) {
  const out: Record<string, number> = {};
  for (const b of buckets) {
    if (b.minute < sinceMinute) continue;
    for (const [k, v] of pick(b)) out[k] = (out[k] ?? 0) + v;
  }
  return Object.fromEntries(Object.entries(out).sort((a, z) => z[1] - a[1]));
}

export function getMetrics() {
  const nowMinute = Math.floor(Date.now() / BUCKET_MS);
  const window = (mins: number) => ({
    requests: sumBuckets((b) => b.requests, nowMinute - mins + 1),
    errorCodes: sumBuckets((b) => b.errorCodes, nowMinute - mins + 1),
    pollOutcomes: sumBuckets((b) => b.polls, nowMinute - mins + 1),
  });
  const sorted = [...pollLatencies].sort((a, z) => a - z);
  return {
    last5min: window(5),
    last60min: window(60),
    pollLatencyMs: { samples: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95), max: percentile(sorted, 100) },
  };
}

/** Poll outcome counts in the last few minutes — drives /api/health's status. */
export function recentPollOutcomes(mins = 5): Record<string, number> {
  return sumBuckets((b) => b.polls, Math.floor(Date.now() / BUCKET_MS) - mins + 1);
}

// ── Client error reports ────────────────────────────────────────────────────

export interface ClientReport {
  at: string;
  user: string;
  kind: string;
  message: string;
  appVersion: string | null;
  requestId: string | null;
  detail: unknown;
  userAgent: string | null;
}

const CLIENT_RING_SIZE = 100;
const clientRing: ClientReport[] = [];

export function recordClientReport(r: ClientReport): void {
  clientRing.push(r);
  if (clientRing.length > CLIENT_RING_SIZE) clientRing.shift();
}

export function getRecent() {
  return {
    logs: [...logRing].reverse(),
    polls: [...pollRing].reverse(),
    clientReports: [...clientRing].reverse(),
  };
}
