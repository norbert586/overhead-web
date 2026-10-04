import { logger } from '../logger';
import type { AdsbAircraft } from '../types/flight';

const log = logger.child({ module: 'adsb' });

// Node's fetch sends no User-Agent at all, and anonymous requests are the
// first thing a Cloudflare-fronted aggregator starts rejecting. Identify
// ourselves like a good API citizen.
const USER_AGENT = 'Overhead/1.0 (+https://overheadflight.com)';

/**
 * Every poll fetches one wide circle and filters locally. The hearing radius
 * (≤15 nm) and the display-only expansion (25 / 50 nm) are all answered from
 * the same snapshot, so an empty sky costs one upstream call instead of three.
 */
export const AREA_RADIUS_NM = 50;

// Per-provider budget. Hedging (below) means a slow provider doesn't hold the
// poll for this long — the next provider is already racing it.
const PROVIDER_TIMEOUT_MS = 4_000;

// If the current provider hasn't answered in this long, start the next one in
// parallel and take whichever answers first. A hard failure skips the wait.
const HEDGE_DELAY_MS = 1_500;

// A provider that just failed moves to the back of the line for this long,
// so a dead upstream doesn't sit in front of every poll. It is still tried
// as a last resort when everything ahead of it fails — slow beats blind.
const PROVIDER_COOLDOWN_MS = 60_000;

// Snapshots are shared by every poll in the same grid cell (two tabs, two
// people on one street, a phone and a laptop). Fresh snapshots are served
// as-is; if every provider is down, a recent snapshot is served as stale
// rather than failing the poll outright.
const SNAPSHOT_FRESH_MS = 5_000;
const SNAPSHOT_STALE_MAX_MS = 45_000;

// Grid for snapshot sharing: 0.02° ≈ 1.2 nm. The upstream query is centred on
// the cell, so a poll is at most ~0.85 nm off-centre — irrelevant against a
// 50 nm fetch radius.
const CELL_DEG = 0.02;
const SNAPSHOT_SWEEP_THRESHOLD = 500;

interface Provider {
  name: string;
  buildUrl: (lat: number, lon: number, radiusNm: number) => string;
}

// All three aggregators serve the same readsb-derived shape ({ ac: [...] }
// with hex/flight/r/t/alt_baro/...), so aircraft from any of them flow
// through the rest of the pipeline unchanged. Order is preference.
//
// Every URL here must return ALL aircraft in the circle. adsb.lol's
// /v2/closest (used before) returns only the single nearest aircraft, which
// silently capped catches at one per poll whenever adsb.lol was healthy.
const PROVIDERS: Provider[] = [
  {
    name: 'adsb.lol',
    buildUrl: (lat, lon, r) =>
      `${process.env.ADSB_BASE_URL ?? 'https://api.adsb.lol/v2/point'}/${lat}/${lon}/${r}`,
  },
  {
    name: 'adsb.fi',
    buildUrl: (lat, lon, r) =>
      `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${r}`,
  },
  {
    name: 'airplanes.live',
    buildUrl: (lat, lon, r) =>
      `https://api.airplanes.live/v2/point/${lat}/${lon}/${r}`,
  },
];

interface ProviderEvent {
  at: string;
  ok: boolean;
  ms: number;
  count?: number;
  error?: string;
}

interface ProviderState {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastLatencyMs: number | null;
  cooldownUntil: number; // epoch ms; 0 = not cooling down
  okCount: number;
  failCount: number;
  history: ProviderEvent[]; // most recent last; shows flapping that "last error" hides
}

const PROVIDER_HISTORY = 20;

const providerState = new Map<string, ProviderState>(
  PROVIDERS.map((p) => [
    p.name,
    {
      lastSuccessAt: null, lastErrorAt: null, lastError: null, lastLatencyMs: null,
      cooldownUntil: 0, okCount: 0, failCount: 0, history: [],
    },
  ]),
);

function pushHistory(state: ProviderState, event: ProviderEvent): void {
  state.history.push(event);
  if (state.history.length > PROVIDER_HISTORY) state.history.shift();
}

interface Snapshot {
  aircraft: AdsbAircraft[];
  provider: string;
  fetchedAt: number;
}

const snapshots = new Map<string, Snapshot>();
const inflight = new Map<string, Promise<Snapshot>>();

/**
 * Snapshot of upstream feed health, surfaced on /api/health so a production
 * outage can be diagnosed with one curl instead of grepping server logs.
 * `withHistory` adds each provider's recent attempts (diagnostics only).
 */
export function getAdsbStatus(withHistory = false) {
  const now = Date.now();
  return {
    providers: PROVIDERS.map((p) => {
      const s = providerState.get(p.name)!;
      return {
        name: p.name,
        lastSuccessAt: s.lastSuccessAt,
        lastLatencyMs: s.lastLatencyMs,
        lastErrorAt: s.lastErrorAt,
        lastError: s.lastError,
        coolingDown: s.cooldownUntil > now,
        okCount: s.okCount,
        failCount: s.failCount,
        ...(withHistory && { history: s.history }),
      };
    }),
    cachedAreas: snapshots.size,
    inflightAreas: inflight.size,
  };
}

const EARTH_RADIUS_NM = 3440.065;

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a));
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  // undici wraps network failures in a bare "fetch failed" TypeError with the
  // real reason (DNS, timeout, reset) on .cause — surface it or the status
  // log is useless.
  const cause = (err as { cause?: unknown }).cause;
  return cause instanceof Error ? `${err.message} (${cause.message})` : err.message;
}

async function fetchFromProvider(
  p: Provider,
  lat: number,
  lon: number,
  radiusNm: number,
  signal: AbortSignal,
): Promise<AdsbAircraft[]> {
  const res = await fetch(p.buildUrl(lat, lon, radiusNm), {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal,
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ''}`);
  }
  const json = (await res.json()) as { ac?: unknown };
  if (!Array.isArray(json?.ac)) {
    // A 200 that isn't the expected shape (moved endpoint, HTML error page,
    // key-required notice) must count as a failure, not an empty sky.
    throw new Error(`unexpected response shape: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.ac as AdsbAircraft[];
}

/**
 * Race the providers: start the preferred one, hedge with the next if it
 * hasn't answered within HEDGE_DELAY_MS (or immediately if it fails), and
 * resolve with the first success. Losers are aborted. Rejects only when
 * every provider has failed.
 */
function fetchFromProviders(lat: number, lon: number, radiusNm: number): Promise<Snapshot> {
  const now = Date.now();
  const cooling = (p: Provider) => providerState.get(p.name)!.cooldownUntil > now;
  const order = [...PROVIDERS.filter((p) => !cooling(p)), ...PROVIDERS.filter(cooling)];

  return new Promise<Snapshot>((resolve, reject) => {
    const controllers: AbortController[] = [];
    let settled = false;
    let launched = 0;
    let failed = 0;
    let hedgeTimer: NodeJS.Timeout | null = null;

    const finish = () => {
      settled = true;
      if (hedgeTimer) clearTimeout(hedgeTimer);
    };

    const launchNext = () => {
      if (settled || launched >= order.length) return;
      const p = order[launched++];
      const state = providerState.get(p.name)!;
      const ctrl = new AbortController();
      controllers.push(ctrl);
      const startedAt = Date.now();
      const timeout = setTimeout(
        () => ctrl.abort(new Error(`timed out after ${PROVIDER_TIMEOUT_MS}ms`)),
        PROVIDER_TIMEOUT_MS,
      );

      if (hedgeTimer) clearTimeout(hedgeTimer);
      hedgeTimer = launched < order.length ? setTimeout(launchNext, HEDGE_DELAY_MS) : null;

      fetchFromProvider(p, lat, lon, radiusNm, ctrl.signal)
        .then((aircraft) => {
          state.lastSuccessAt = new Date().toISOString();
          state.lastLatencyMs = Date.now() - startedAt;
          state.cooldownUntil = 0;
          state.okCount += 1;
          pushHistory(state, { at: state.lastSuccessAt, ok: true, ms: state.lastLatencyMs, count: aircraft.length });
          if (settled) return;
          finish();
          for (const c of controllers) if (c !== ctrl) c.abort();
          log.debug({ provider: p.name, count: aircraft.length, ms: state.lastLatencyMs }, 'adsb fetch ok');
          resolve({ aircraft, provider: p.name, fetchedAt: Date.now() });
        })
        .catch((err) => {
          // A loser we aborted ourselves after another provider won is not
          // a provider failure — don't cool it down.
          if (settled) return;
          state.lastErrorAt = new Date().toISOString();
          state.lastError = describeError(ctrl.signal.aborted ? ctrl.signal.reason : err);
          state.cooldownUntil = Date.now() + PROVIDER_COOLDOWN_MS;
          state.failCount += 1;
          pushHistory(state, { at: state.lastErrorAt, ok: false, ms: Date.now() - startedAt, error: state.lastError });
          log.warn({ provider: p.name, error: state.lastError }, 'adsb provider failed');
          failed += 1;
          if (failed >= order.length) {
            finish();
            reject(new Error('all adsb providers failed'));
          } else {
            launchNext(); // fail fast — don't sit out the hedge delay
          }
        })
        .finally(() => clearTimeout(timeout));
    };

    launchNext();
  });
}

function cellKey(lat: number, lon: number): string {
  return `${Math.round(lat / CELL_DEG)}:${Math.round(lon / CELL_DEG)}`;
}

function sweepSnapshots(now: number): void {
  if (snapshots.size < SNAPSHOT_SWEEP_THRESHOLD) return;
  for (const [key, snap] of snapshots) {
    if (now - snap.fetchedAt > SNAPSHOT_STALE_MAX_MS) snapshots.delete(key);
  }
}

export interface AreaResult {
  /** False means every provider failed and nothing recent is cached — an outage, NOT an empty sky. */
  ok: boolean;
  /** Aircraft within AREA_RADIUS_NM, with dst measured from the query point, closest first. */
  aircraft: AdsbAircraft[];
  provider: string | null;
  /** True when served from a recent snapshot because every provider just failed. */
  stale: boolean;
  /** Age of the underlying snapshot. */
  ageMs: number;
  /** Where the data came from — for diagnostics. */
  source: 'cache' | 'shared' | 'fetched' | 'stale' | 'none';
}

/**
 * Re-measure every aircraft from the caller's exact position (the snapshot
 * was fetched around the cell centre) and sort closest first. Copies — the
 * snapshot is shared across callers and must not be mutated.
 */
function viewFrom(snap: Snapshot, lat: number, lon: number, source: AreaResult['source']): AreaResult {
  const stale = source === 'stale';
  const aircraft: AdsbAircraft[] = [];
  for (const ac of snap.aircraft) {
    const dst =
      typeof ac.lat === 'number' && typeof ac.lon === 'number'
        ? haversineNm(lat, lon, ac.lat, ac.lon)
        : ac.dst;
    if (typeof dst !== 'number' || !Number.isFinite(dst)) continue;
    aircraft.push({ ...ac, dst });
  }
  aircraft.sort((a, b) => a.dst! - b.dst!);
  return { ok: true, aircraft, provider: snap.provider, stale, ageMs: Date.now() - snap.fetchedAt, source };
}

/**
 * Every aircraft within AREA_RADIUS_NM of the given point. Concurrent callers
 * in the same grid cell share one upstream request, and a snapshot younger
 * than SNAPSHOT_FRESH_MS is reused without touching the network.
 */
export async function fetchArea(lat: number, lon: number): Promise<AreaResult> {
  const key = cellKey(lat, lon);
  const cached = snapshots.get(key);
  if (cached && Date.now() - cached.fetchedAt < SNAPSHOT_FRESH_MS) {
    return viewFrom(cached, lat, lon, 'cache');
  }

  let pending = inflight.get(key);
  const joined = !!pending;
  if (!pending) {
    const [ky, kx] = key.split(':').map(Number);
    const centerLat = +(ky * CELL_DEG).toFixed(4);
    const centerLon = +(kx * CELL_DEG).toFixed(4);
    pending = fetchFromProviders(centerLat, centerLon, AREA_RADIUS_NM)
      .then((snap) => {
        sweepSnapshots(snap.fetchedAt);
        snapshots.set(key, snap);
        return snap;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  try {
    return viewFrom(await pending, lat, lon, joined ? 'shared' : 'fetched');
  } catch {
    const last = snapshots.get(key);
    if (last && Date.now() - last.fetchedAt < SNAPSHOT_STALE_MAX_MS) {
      log.warn({ ageMs: Date.now() - last.fetchedAt }, 'all adsb providers failed — serving stale snapshot');
      return viewFrom(last, lat, lon, 'stale');
    }
    log.error({ status: getAdsbStatus() }, 'all adsb providers failed');
    return { ok: false, aircraft: [], provider: null, stale: false, ageMs: 0, source: 'none' };
  }
}

// ── Live probe (diagnostics) ────────────────────────────────────────────────

export interface ProbeResult {
  name: string;
  ok: boolean;
  ms: number;
  status: number | null;
  aircraft: number | null;
  error: string | null;
}

/**
 * Ask every provider directly, right now, bypassing cooldowns and caches —
 * "can this server reach the feeds?" answered even when no one has polled
 * since the last restart. Doesn't touch provider state, so a probe can't
 * put a healthy provider into cooldown.
 */
export async function probeProviders(lat = 40.69, lon = -74.17): Promise<ProbeResult[]> {
  return Promise.all(PROVIDERS.map(async (p): Promise<ProbeResult> => {
    const started = Date.now();
    try {
      const res = await fetch(p.buildUrl(lat, lon, 10), {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS * 2),
      });
      const text = await res.text();
      let aircraft: number | null = null;
      try {
        const json = JSON.parse(text) as { ac?: unknown };
        if (Array.isArray(json.ac)) aircraft = json.ac.length;
      } catch { /* not JSON — reported below */ }
      const ok = res.ok && aircraft !== null;
      return {
        name: p.name, ok, ms: Date.now() - started, status: res.status, aircraft,
        error: ok ? null : `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    } catch (err) {
      return { name: p.name, ok: false, ms: Date.now() - started, status: null, aircraft: null, error: describeError(err) };
    }
  }));
}
