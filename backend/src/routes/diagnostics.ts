import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth';
import { getAdsbStatus, probeProviders, type ProbeResult } from '../services/adsb';
import { getEnrichmentStatus, probeAdsbdb } from '../services/enrichment';
import { getPhotoStatus, probePhotoProviders } from '../services/photos';
import { getMetrics, getRecent, recordClientReport } from '../services/diagnostics';
import { get, DB_PATH } from '../database/db';
import { VERSION } from '../version';
import { logger } from '../logger';

const log = logger.child({ module: 'diagnostics' });
const router = Router();

// ── Access: admin session, or the diagnostics key ───────────────────────────
//
// DIAGNOSTICS_KEY (≥ 24 chars, in backend/.env) grants read-only access to
// the endpoints below via an `X-Diagnostics-Key` header. It exists so a
// debugging session — a teammate, or a Claude Code session given the key as
// an environment secret — can read production state without an admin
// password. Unset = key access disabled; admins can always get in.

const DIAGNOSTICS_KEY = process.env.DIAGNOSTICS_KEY ?? '';
const KEY_ENABLED = DIAGNOSTICS_KEY.length >= 24;
if (DIAGNOSTICS_KEY && !KEY_ENABLED) {
  log.warn('DIAGNOSTICS_KEY is set but shorter than 24 characters — key access disabled');
}

function keyMatches(presented: string): boolean {
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(DIAGNOSTICS_KEY).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireDiagnosticsAccess(req: Request, res: Response, next: NextFunction): void {
  const presented = req.headers['x-diagnostics-key'];
  if (KEY_ENABLED && typeof presented === 'string' && keyMatches(presented)) {
    next();
    return;
  }
  requireAuth(req, res, () => requireAdmin(req, res, next));
}

// ── Snapshot ────────────────────────────────────────────────────────────────

function fileSize(p: string): number | null {
  try {
    return fs.statSync(p).size;
  } catch {
    return null;
  }
}

function count(table: string): number | null {
  try {
    return get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? null;
  } catch {
    return null;
  }
}

function databaseStats() {
  return {
    sizeBytes: fileSize(DB_PATH),
    walBytes: fileSize(`${DB_PATH}-wal`),
    rows: {
      users: count('users'),
      flights: count('flights'),
      flightTrack: count('flight_track'),
      aircraftCache: count('aircraft_cache'),
      callsignCache: count('callsign_cache'),
    },
  };
}

function processStats() {
  const mem = process.memoryUsage();
  const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;
  return {
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    memoryMb: { rss: mb(mem.rss), heapUsed: mb(mem.heapUsed), heapTotal: mb(mem.heapTotal) },
    env: {
      nodeEnv: process.env.NODE_ENV ?? null,
      logLevel: process.env.LOG_LEVEL ?? null,
      jwtSecretSet: !!process.env.JWT_SECRET,
      emailConfigured: !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
      adsbBaseUrlOverride: process.env.ADSB_BASE_URL ?? null,
      // Set only for local mocks — any of these in production means photos come from the wrong place.
      photoUrlOverrides: [process.env.PLANESPOTTERS_BASE_URL, process.env.AIRPORT_DATA_BASE_URL, process.env.WIKIPEDIA_API_URL]
        .filter(Boolean).join(' ') || null,
      diagnosticsKeyEnabled: KEY_ENABLED,
    },
  };
}

/**
 * @openapi
 * /api/diagnostics:
 *   get:
 *     summary: Full diagnostics snapshot (admin, or X-Diagnostics-Key)
 *     description: |
 *       Version, process, database, upstream feed health with per-provider
 *       history, adsbdb breaker, request/poll metrics for the last 5 and 60
 *       minutes, and the most recent warn/error log entries, /api/flights
 *       polls, and client error reports. All in-memory; resets on restart.
 *     tags: [Diagnostics]
 *     responses:
 *       200: { description: Snapshot }
 *       401: { description: Not signed in / bad key }
 *       403: { description: Not an admin }
 */
router.get('/', requireDiagnosticsAccess, (_req: Request, res: Response) => {
  res.json({
    generatedAt: new Date().toISOString(),
    version: VERSION,
    process: processStats(),
    database: databaseStats(),
    adsb: getAdsbStatus(true),
    enrichment: getEnrichmentStatus(),
    photos: getPhotoStatus(true),
    metrics: getMetrics(),
    recent: getRecent(),
  });
});

// Probes hit seven external APIs; cache the answer so a refresh-happy admin
// page (or a leaked key) can't turn this into a load generator.
const PROBE_CACHE_MS = 30_000;
let lastProbe: { at: number; body: unknown } | null = null;
let probing: Promise<unknown> | null = null;

/**
 * @openapi
 * /api/diagnostics/probe:
 *   get:
 *     summary: Live connectivity check from this server to every upstream (admin, or X-Diagnostics-Key)
 *     description: |
 *       Calls each ADS-B provider and adsbdb right now, bypassing caches,
 *       cooldowns and the breaker. Answers "can the server reach the feeds?"
 *       even when nobody has polled since the last restart. Cached 30 s.
 *     tags: [Diagnostics]
 *     responses:
 *       200: { description: Probe results }
 */
router.get('/probe', requireDiagnosticsAccess, async (_req: Request, res: Response) => {
  if (lastProbe && Date.now() - lastProbe.at < PROBE_CACHE_MS) {
    res.json({ ...(lastProbe.body as object), cached: true });
    return;
  }
  probing ??= (async () => {
    const started = Date.now();
    const [providers, adsbdb, photos] = await Promise.all([probeProviders(), probeAdsbdb(), probePhotoProviders()]);
    let databaseOk = false;
    try {
      databaseOk = get<{ ok: number }>('SELECT 1 AS ok')?.ok === 1;
    } catch { /* reported as false */ }
    const body = {
      probedAt: new Date().toISOString(),
      ms: Date.now() - started,
      allProvidersDown: providers.every((p: ProbeResult) => !p.ok),
      providers,
      adsbdb,
      photos,
      database: { ok: databaseOk },
    };
    lastProbe = { at: Date.now(), body };
    return body;
  })().finally(() => { probing = null; });
  res.json(await probing);
});

// ── Client error reports ────────────────────────────────────────────────────
//
// The browser reports what the user actually saw: failed polls (with the
// request id), JS crashes, chunk-load failures after a deploy, session
// expiries. Public (guests break too), small, and rate-limited per IP.

const REPORT_WINDOW_MS = 10 * 60_000;
const REPORT_MAX = 30;
const reportBuckets = new Map<string, { count: number; resetAt: number }>();

function clip(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  return String(v).slice(0, max);
}

/**
 * @openapi
 * /api/diagnostics/client-report:
 *   post:
 *     summary: Record an error the browser hit (public, rate-limited)
 *     tags: [Diagnostics]
 *     security: []
 *     responses:
 *       204: { description: Recorded }
 *       429: { description: Too many reports }
 */
router.post('/client-report', optionalAuth, (req: Request, res: Response) => {
  const ip = (req.headers['cf-connecting-ip'] as string | undefined)
    ?? (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? req.ip ?? 'unknown';
  const now = Date.now();
  const bucket = reportBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    if (reportBuckets.size > 1_000) reportBuckets.clear();
    reportBuckets.set(ip, { count: 1, resetAt: now + REPORT_WINDOW_MS });
  } else if (bucket.count >= REPORT_MAX) {
    res.status(429).json({ error: 'Too many reports', code: 'rate_limited' });
    return;
  } else {
    bucket.count += 1;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  let detail: unknown = null;
  try {
    const raw = JSON.stringify(body.detail ?? null);
    detail = raw.length <= 2_000 ? JSON.parse(raw) : raw.slice(0, 2_000);
  } catch { /* drop unserialisable detail */ }

  const report = {
    at: new Date().toISOString(),
    user: req.userId !== undefined ? `u${req.userId}` : 'guest',
    kind: clip(body.kind, 40) ?? 'unknown',
    message: clip(body.message, 500) ?? '',
    appVersion: clip(body.appVersion, 40),
    requestId: clip(body.requestId, 64),
    detail,
    userAgent: clip(req.headers['user-agent'], 200),
  };
  recordClientReport(report);
  log.warn({ code: report.kind, reqId: report.requestId }, `client report: ${report.kind} — ${report.message}`);
  res.status(204).end();
});

export default router;
