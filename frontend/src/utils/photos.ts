// Shared photo waterfall — module-level caches so results survive re-renders
// and are shared between AircraftPhoto (main view) and LogScreen (detail rows).
//
// Order of attack for an airframe with no adsbdb photo:
//   2a. Planespotters by registration
//   2b. Planespotters by ICAO hex (many contacts have a hex but no reg)
//   3a. Our own shared photo pool, by ICAO type (backend)
//   3b. Other registrations of the same type we know about, tried against
//       Planespotters one by one — the "similar aircraft" everyone expects
//
// Every Planespotters hit for a real registration is reported back to the
// backend so the shared pool grows and 3a answers instantly next time.

import { getToken } from '../hooks/useAuth';

type PhotoEntry = {
  thumbnail_large?: { src?: string };
  large?: { src?: string };
};

export interface ResolvedPhoto {
  url: string;
  /** 'reg' | 'hex' — the actual airframe; 'similar' — same model, different airframe. */
  source: 'reg' | 'hex' | 'similar';
  /** For 'similar': the registration of the surrogate airframe shown. */
  surrogateReg: string | null;
}

const regCache  = new Map<string, string | null>();
const hexCache  = new Map<string, string | null>();
const deepCache = new Map<string, ResolvedPhoto | null>();

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function upsizeUrl(url: string): string {
  return url
    .replace('/thumbnail_large/', '/full_nosym/')
    .replace('-thumbnail_large.', '.');
}

function bestSrc(photo: PhotoEntry | undefined): string | null {
  const thumb = photo?.thumbnail_large?.src ?? null;
  return photo?.large?.src ?? (thumb ? upsizeUrl(thumb) : null);
}

async function planespotters(path: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.planespotters.net/pub/photos/${path}`);
    if (!res.ok) return null;
    const json = await res.json() as { photos?: PhotoEntry[] };
    return bestSrc(json?.photos?.[0]);
  } catch {
    return null;
  }
}

/** Planespotters by registration. */
export async function fetchPhoto(
  registration: string,
  aircraftType: string | null = null,
): Promise<string | null> {
  const key = registration.toUpperCase();
  if (regCache.has(key)) return regCache.get(key)!;
  const src = await planespotters(`reg/${encodeURIComponent(key)}`);
  regCache.set(key, src);
  if (src) reportPhoto(key, src, aircraftType);
  return src;
}

/** Planespotters by ICAO 24-bit hex. */
export async function fetchPhotoByHex(hex: string): Promise<string | null> {
  const key = hex.toLowerCase();
  if (hexCache.has(key)) return hexCache.get(key)!;
  const src = await planespotters(`hex/${encodeURIComponent(key)}`);
  hexCache.set(key, src);
  return src;
}

/** Fire-and-forget: grow the backend's shared photo pool. */
function reportPhoto(registration: string, photoUrl: string, aircraftType: string | null): void {
  if (!getToken()) return;
  fetch(`${API_BASE}/api/flights/photo-cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ registration, photoUrl, aircraftType }),
  }).catch(() => {});
}

async function fetchStoredPoolPhoto(
  typeCode: string,
  excludeRegistration: string | null,
): Promise<ResolvedPhoto | null> {
  try {
    const params = excludeRegistration ? `?exclude=${encodeURIComponent(excludeRegistration)}` : '';
    const res = await fetch(
      `${API_BASE}/api/flights/photo-by-type/${encodeURIComponent(typeCode)}${params}`,
      { headers: authHeaders() },
    );
    if (!res.ok) return null;
    const json = await res.json() as { photoUrl?: string; registration?: string | null };
    if (!json?.photoUrl) return null;
    return { url: json.photoUrl, source: 'similar', surrogateReg: json.registration ?? null };
  } catch {
    return null;
  }
}

async function fetchTypeRegistrations(
  typeCode: string,
  excludeRegistration: string | null,
): Promise<string[]> {
  try {
    const params = excludeRegistration ? `?exclude=${encodeURIComponent(excludeRegistration)}` : '';
    const res = await fetch(
      `${API_BASE}/api/flights/type-registrations/${encodeURIComponent(typeCode)}${params}`,
      { headers: authHeaders() },
    );
    if (!res.ok) return [];
    const json = await res.json() as { registrations?: string[] };
    return json?.registrations ?? [];
  } catch {
    return [];
  }
}

/**
 * The full fallback waterfall below tier 1 (adsbdb). Cached per airframe;
 * returns null only when every avenue is exhausted.
 */
export async function findPhotoDeep(
  registration: string | null,
  hex: string | null,
  aircraftType: string | null,
): Promise<ResolvedPhoto | null> {
  const cacheKey = `${registration ?? ''}|${hex ?? ''}|${aircraftType ?? ''}`;
  if (deepCache.has(cacheKey)) return deepCache.get(cacheKey)!;

  const resolved = await (async (): Promise<ResolvedPhoto | null> => {
    // 2a. The actual airframe, by registration
    if (registration) {
      const url = await fetchPhoto(registration, aircraftType);
      if (url) return { url, source: 'reg', surrogateReg: null };
    }
    // 2b. The actual airframe, by hex
    if (hex) {
      const url = await fetchPhotoByHex(hex);
      if (url) return { url, source: 'hex', surrogateReg: null };
    }
    if (!aircraftType) return null;

    // 3a. Shared pool of photos we've already found for this type
    const pooled = await fetchStoredPoolPhoto(aircraftType, registration);
    if (pooled) return pooled;

    // 3b. Walk sibling airframes of the same type through Planespotters
    const siblings = await fetchTypeRegistrations(aircraftType, registration);
    for (const reg of siblings.slice(0, 3)) {
      const url = await fetchPhoto(reg, aircraftType); // reports hits to the pool
      if (url) return { url, source: 'similar', surrogateReg: reg };
    }
    return null;
  })();

  deepCache.set(cacheKey, resolved);
  return resolved;
}

/** Derive the safe thumbnail_large URL from an upsized URL, for onError fallback. */
export function thumbnailFallback(upsized: string): string {
  return upsized
    .replace('/full_nosym/', '/thumbnail_large/');
}
