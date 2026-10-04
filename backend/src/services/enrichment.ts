import {
  getAircraftCache, setAircraftCache,
  getCallsignCache, setCallsignCache,
} from '../database/queries';
import { logger } from '../logger';

const log = logger.child({ module: 'enrichment' });
// ADSBDB_BASE_URL points lookups at a mock (scripts/mock-adsb.mjs) for local runs.
const ADSBDB = process.env.ADSBDB_BASE_URL ?? 'https://api.adsbdb.com/v0';
const USER_AGENT = 'Overhead/1.0 (+https://overheadflight.com)';
const FETCH_TIMEOUT_MS = 8_000;

// adsbdb is a free community API. A cold cache over a busy sky used to fire
// one request per aircraft all at once; cap it so we stay a polite client
// (and don't get rate-limited into a wall of misses).
const MAX_CONCURRENT_LOOKUPS = 6;

// A transient failure (timeout, 429, 5xx, network) says nothing about the
// aircraft, so it must not be written to the persistent cache — that blanked
// enrichment for 6 hours after every blip. Remember it in memory briefly
// instead, so a struggling adsbdb isn't hammered on every poll.
const TRANSIENT_RETRY_MS = 2 * 60_000;

// Circuit breaker: after this many transient failures in a row, stop calling
// adsbdb for a minute. Polls stay fast (no 8 s timeouts) and enrichment fills
// back in through the cache once it recovers.
const BREAKER_THRESHOLD = 5;
const BREAKER_OPEN_MS = 60_000;

export interface AircraftEnrichment {
  manufacturer: string | null;
  owner: string | null;
  country: string | null;
  countryIso: string | null;
  photoUrl: string | null;
}

export interface RouteEnrichment {
  operator: string | null;
  originIata: string | null;
  originCity: string | null;
  originCountry: string | null;
  destinationIata: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
}

export const EMPTY_AIRCRAFT: AircraftEnrichment = {
  manufacturer: null, owner: null, country: null, countryIso: null, photoUrl: null,
};

export const EMPTY_ROUTE: RouteEnrichment = {
  operator: null, originIata: null, originCity: null, originCountry: null,
  destinationIata: null, destinationCity: null, destinationCountry: null,
};

class TransientError extends Error {}

let activeLookups = 0;
const lookupQueue: (() => void)[] = [];
const inflight = new Map<string, Promise<unknown>>();
const transientMisses = new Map<string, number>(); // key → retry-after epoch ms
let consecutiveTransient = 0;
let breakerOpenUntil = 0;

export function getEnrichmentStatus() {
  return {
    breakerOpen: breakerOpenUntil > Date.now(),
    breakerOpenUntil: breakerOpenUntil > Date.now() ? new Date(breakerOpenUntil).toISOString() : null,
    consecutiveTransientFailures: consecutiveTransient,
    activeLookups,
    queuedLookups: lookupQueue.length,
    transientMissesRemembered: transientMisses.size,
  };
}

/** Diagnostics: can we reach adsbdb right now? Bypasses caches and the breaker. */
export async function probeAdsbdb(): Promise<{ ok: boolean; ms: number; status: number | null; error: string | null }> {
  const started = Date.now();
  try {
    const res = await fetch(`${ADSBDB}/callsign/UAL1`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // 404 is a healthy answer ("unknown callsign") — anything that isn't 2xx/404 is not.
    const ok = res.ok || res.status === 404;
    return { ok, ms: Date.now() - started, status: res.status, error: ok ? null : (await res.text()).slice(0, 200) };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, status: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function withLookupSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeLookups >= MAX_CONCURRENT_LOOKUPS) {
    // Woken with a slot handed over by a finishing lookup — the count
    // already includes us, so nobody can slip in between.
    await new Promise<void>((resolve) => lookupQueue.push(resolve));
  } else {
    activeLookups += 1;
  }
  try {
    return await fn();
  } finally {
    const next = lookupQueue.shift();
    if (next) next();
    else activeLookups -= 1;
  }
}

/**
 * GET an adsbdb resource. Resolves with the parsed body, or null for a
 * definitive miss (404 / other 4xx). Throws TransientError for anything that
 * might succeed on retry.
 */
async function adsbdbGet(path: string): Promise<unknown | null> {
  return withLookupSlot(async () => {
    let res: Response;
    try {
      res = await fetch(`${ADSBDB}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      throw new TransientError(err instanceof Error ? err.message : String(err));
    }
    // Only "no such aircraft/callsign" is a fact about the lookup. Anything
    // else (403 from a bot wall, 429, 5xx) is about us or adsbdb right now.
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new TransientError(`HTTP ${res.status}`);
    try {
      return await res.json();
    } catch (err) {
      throw new TransientError(`bad JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

/**
 * Shared lookup wrapper: dedupes concurrent lookups of the same key, honours
 * the breaker and the transient-miss memo, and tracks breaker state.
 */
function lookup<T>(key: string, empty: T, run: () => Promise<T>): Promise<T> {
  const now = Date.now();
  if (breakerOpenUntil > now) return Promise.resolve(empty);
  const retryAt = transientMisses.get(key);
  if (retryAt !== undefined) {
    if (retryAt > now) return Promise.resolve(empty);
    transientMisses.delete(key);
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = run()
    .then((result) => {
      consecutiveTransient = 0;
      return result;
    })
    .catch((err) => {
      // Enrichment is decoration — never let it fail the poll it's part of.
      if (!(err instanceof TransientError)) {
        log.error({ err, key }, 'enrichment lookup failed');
        return empty;
      }
      consecutiveTransient += 1;
      transientMisses.set(key, Date.now() + TRANSIENT_RETRY_MS);
      if (transientMisses.size > 5_000) transientMisses.clear();
      if (consecutiveTransient >= BREAKER_THRESHOLD && breakerOpenUntil <= Date.now()) {
        breakerOpenUntil = Date.now() + BREAKER_OPEN_MS;
        log.warn({ consecutiveTransient }, 'adsbdb failing — pausing lookups for 60s');
      }
      log.warn({ key, error: err.message }, 'adsbdb lookup failed (transient)');
      return empty;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function enrichAircraft(registration: string): Promise<AircraftEnrichment> {
  const cached = getAircraftCache(registration);
  if (cached) {
    return {
      manufacturer: cached.manufacturer as string | null,
      owner:        cached.owner        as string | null,
      country:      cached.country      as string | null,
      countryIso:   cached.country_iso  as string | null,
      photoUrl:     cached.photo_url    as string | null,
    };
  }

  const NEGATIVE = { aircraftType: null, manufacturer: null, owner: null, country: null, countryIso: null, photoUrl: null };

  return lookup(`ac:${registration}`, EMPTY_AIRCRAFT, async () => {
    const json = await adsbdbGet(`/aircraft/${encodeURIComponent(registration)}`) as {
      response?: {
        aircraft?: {
          manufacturer?: string;
          registered_owner?: string;
          registered_owner_country_name?: string;
          registered_owner_country_iso_name?: string;
          url_photo?: string;
          type?: string;
        };
      };
    } | null;

    // Definitive miss (unknown registration) — cache it on the negative TTL.
    const ac = json?.response?.aircraft;
    if (!ac) {
      setAircraftCache(registration, NEGATIVE);
      return EMPTY_AIRCRAFT;
    }

    const result: AircraftEnrichment = {
      manufacturer: ac.manufacturer ?? null,
      owner:        ac.registered_owner ?? null,
      country:      ac.registered_owner_country_name ?? null,
      countryIso:   ac.registered_owner_country_iso_name ?? null,
      photoUrl:     ac.url_photo ?? null,
    };

    setAircraftCache(registration, { aircraftType: ac.type ?? null, ...result });
    return result;
  });
}

export async function enrichCallsign(callsign: string): Promise<RouteEnrichment> {
  const cached = getCallsignCache(callsign);
  if (cached) {
    return {
      operator:           cached.operator           as string | null,
      originIata:         cached.origin_iata        as string | null,
      originCity:         cached.origin_city        as string | null,
      originCountry:      cached.origin_country     as string | null,
      destinationIata:    cached.destination_iata   as string | null,
      destinationCity:    cached.destination_city   as string | null,
      destinationCountry: cached.destination_country as string | null,
    };
  }

  const NEGATIVE = { operator: null, originIata: null, originCity: null, originCountry: null, destinationIata: null, destinationCity: null, destinationCountry: null };

  return lookup(`cs:${callsign}`, EMPTY_ROUTE, async () => {
    const json = await adsbdbGet(`/callsign/${encodeURIComponent(callsign)}`) as {
      response?: {
        flightroute?: {
          airline?: { name?: string };
          origin?: { iata_code?: string; municipality?: string; country_iso_name?: string };
          destination?: { iata_code?: string; municipality?: string; country_iso_name?: string };
        };
      };
    } | null;

    // Definitive miss (no known route for this callsign) — negative cache.
    const route = json?.response?.flightroute;
    if (!route) {
      setCallsignCache(callsign, NEGATIVE);
      return EMPTY_ROUTE;
    }

    const result: RouteEnrichment = {
      operator:           route.airline?.name ?? null,
      originIata:         route.origin?.iata_code ?? null,
      originCity:         route.origin?.municipality ?? null,
      originCountry:      route.origin?.country_iso_name ?? null,
      destinationIata:    route.destination?.iata_code ?? null,
      destinationCity:    route.destination?.municipality ?? null,
      destinationCountry: route.destination?.country_iso_name ?? null,
    };

    setCallsignCache(callsign, result);
    return result;
  });
}
