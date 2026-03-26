import type { AdsbAircraft } from '../types/flight';

const BASE        = 'https://api.adsb.lol/v2/closest';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1500; // ms between attempts

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isTransient(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
}

/**
 * Fetch the single closest aircraft within radiusNm of the given coordinates.
 * Retries up to MAX_RETRIES times on transient network errors (ECONNRESET etc).
 * Returns null if no aircraft is in range or all attempts fail.
 */
export async function fetchClosest(
  lat: number,
  lon: number,
  radiusNm: number,
): Promise<AdsbAircraft | null> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}/${lat}/${lon}/${radiusNm}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`adsb.lol ${res.status}`);

      const json = await res.json() as { ac?: AdsbAircraft[] };
      const aircraft = json?.ac;
      if (!aircraft || aircraft.length === 0) return null;

      return aircraft[0];
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
  return null;
}
