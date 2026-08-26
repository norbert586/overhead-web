import { logger } from '../logger';
import type { AdsbAircraft } from '../types/flight';

const log = logger.child({ module: 'adsb' });

// Node's fetch sends no User-Agent at all, and anonymous requests are the
// first thing a Cloudflare-fronted aggregator starts rejecting. Identify
// ourselves like a good API citizen.
const USER_AGENT = 'Overhead/1.0 (+https://overheadflight.com)';

const FETCH_TIMEOUT_MS = 5_000;

// A provider that just failed is skipped for this long so a dead upstream
// doesn't add its full timeout to every poll. If every provider is cooling
// down they are all tried anyway — worst case the poll is slow, not blind.
const PROVIDER_COOLDOWN_MS = 2 * 60_000;

interface Provider {
  name: string;
  buildUrl: (lat: number, lon: number, radiusNm: number) => string;
}

// All three aggregators serve the same readsb-derived shape ({ ac: [...] }
// with hex/flight/r/t/alt_baro/...), so aircraft from any of them flow
// through the rest of the pipeline unchanged. Order is preference; the
// first provider that answers wins.
const PROVIDERS: Provider[] = [
  {
    name: 'adsb.lol',
    buildUrl: (lat, lon, r) =>
      `${process.env.ADSB_BASE_URL ?? 'https://api.adsb.lol/v2/closest'}/${lat}/${lon}/${r}`,
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

interface ProviderState {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  cooldownUntil: number; // epoch ms; 0 = not cooling down
}

const providerState = new Map<string, ProviderState>(
  PROVIDERS.map((p) => [
    p.name,
    { lastSuccessAt: null, lastErrorAt: null, lastError: null, cooldownUntil: 0 },
  ]),
);

/**
 * Snapshot of upstream feed health, surfaced on /health so a production
 * outage can be diagnosed with one curl instead of grepping server logs.
 */
export function getAdsbStatus() {
  const now = Date.now();
  return {
    providers: PROVIDERS.map((p) => {
      const s = providerState.get(p.name)!;
      return {
        name: p.name,
        lastSuccessAt: s.lastSuccessAt,
        lastErrorAt: s.lastErrorAt,
        lastError: s.lastError,
        coolingDown: s.cooldownUntil > now,
      };
    }),
  };
}

const EARTH_RADIUS_NM = 3440.065;

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a));
}

export interface NearbyResult {
  /** False means every provider failed — an upstream outage, NOT an empty sky. */
  ok: boolean;
  aircraft: AdsbAircraft[];
  provider: string | null;
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
): Promise<AdsbAircraft[]> {
  const res = await fetch(p.buildUrl(lat, lon, radiusNm), {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
 * Fetch ALL aircraft within radiusNm of the given coordinates, trying each
 * provider in turn. `ok: false` means every provider failed; an empty
 * aircraft list with `ok: true` is a genuinely empty sky.
 */
export async function fetchNearby(
  lat: number,
  lon: number,
  radiusNm: number,
): Promise<NearbyResult> {
  const now = Date.now();
  let candidates = PROVIDERS.filter((p) => providerState.get(p.name)!.cooldownUntil <= now);
  if (!candidates.length) candidates = PROVIDERS;

  for (const p of candidates) {
    const state = providerState.get(p.name)!;
    try {
      const aircraft = await fetchFromProvider(p, lat, lon, radiusNm);
      state.lastSuccessAt = new Date().toISOString();
      state.cooldownUntil = 0;

      // Not every provider reports dst; fill it from the query point so
      // distance sorting and display hold regardless of source.
      for (const ac of aircraft) {
        if (typeof ac.dst !== 'number' && typeof ac.lat === 'number' && typeof ac.lon === 'number') {
          ac.dst = haversineNm(lat, lon, ac.lat, ac.lon);
        }
      }

      log.debug({ provider: p.name, count: aircraft.length }, 'adsb fetch ok');
      return { ok: true, aircraft, provider: p.name };
    } catch (err) {
      state.lastErrorAt = new Date().toISOString();
      state.lastError = describeError(err);
      state.cooldownUntil = Date.now() + PROVIDER_COOLDOWN_MS;
      log.warn({ provider: p.name, error: state.lastError }, 'adsb provider failed');
    }
  }

  log.error({ status: getAdsbStatus() }, 'all adsb providers failed');
  return { ok: false, aircraft: [], provider: null };
}
