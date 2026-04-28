import type { AdsbAircraft } from '../types/flight';

const BASE        = 'https://api.adsb.lol/v2/closest';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1500; // ms between attempts

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isTransient(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  const msg  = (err as Error)?.message ?? '';
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    msg.includes('Connect Timeout') ||
    msg.includes('fetch failed')
  );
}

/**
 * Fetch ALL aircraft within radiusNm of the given coordinates.
 * Returns an empty array if none are in range or all attempts fail.
 * Aircraft are sorted by distance (closest first) by adsb.lol.
 */
export async function fetchAll(
  lat: number,
  lon: number,
  radiusNm: number,
): Promise<AdsbAircraft[]> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}/${lat}/${lon}/${radiusNm}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`adsb.lol ${res.status}`);

      const json = await res.json() as { ac?: AdsbAircraft[] };
      console.log('[adsb.lol] ac count:', json?.ac?.length ?? 0);
      return json?.ac ?? [];
    } catch (err) {
      lastErr = err;
      const transient = isTransient((err as NodeJS.ErrnoException)?.cause ?? err);
      if (transient && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY);
        continue;
      }
      break;
    }
  }

  console.error('adsb.lol fetch error:', lastErr);
  return [];
}

/**
 * Returns only the single closest aircraft, or null if none in range.
 * Kept for callers that only need one aircraft.
 */
export async function fetchClosest(
  lat: number,
  lon: number,
  radiusNm: number,
): Promise<AdsbAircraft | null> {
  const aircraft = await fetchAll(lat, lon, radiusNm);
  return aircraft[0] ?? null;
}
