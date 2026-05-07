// Shared photo fetch — module-level cache so results survive re-renders
// and are shared between AircraftPhoto (main view) and LogScreen (detail rows).

import { getToken } from '../hooks/useAuth';

type PhotoEntry = {
  thumbnail_large?: { src?: string };
  large?: { src?: string };
};

export interface SamePlaneTypeMatch {
  url: string;
  registration: string | null;  // The registration of the surrogate airframe.
}

const cache     = new Map<string, string | null>();
const typeCache = new Map<string, SamePlaneTypeMatch | null>();

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function upsizeUrl(url: string): string {
  return url
    .replace('/thumbnail_large/', '/full_nosym/')
    .replace('-thumbnail_large.', '.');
}

function bestSrc(photo: PhotoEntry | undefined): string | null {
  const thumb = photo?.thumbnail_large?.src ?? null;
  return photo?.large?.src ?? (thumb ? upsizeUrl(thumb) : null);
}

/** Provider 2: Planespotters by registration. */
export async function fetchPhoto(registration: string): Promise<string | null> {
  if (cache.has(registration)) return cache.get(registration)!;
  try {
    const res = await fetch(
      `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(registration)}`,
    );
    if (!res.ok) { cache.set(registration, null); return null; }
    const json = await res.json() as { photos?: PhotoEntry[] };
    const src = bestSrc(json?.photos?.[0]);
    cache.set(registration, src);
    return src;
  } catch {
    cache.set(registration, null);
    return null;
  }
}

/**
 * Last-resort fallback: ask the backend for any aircraft we've already seen
 * of the same ICAO type that has a stored photo. The returned `registration`
 * is the surrogate airframe — surface it in the UI so users know the photo
 * isn't of their actual aircraft.
 *
 * `excludeRegistration` prevents the backend from returning the very airframe
 * we're already trying to render (which by definition has no usable photo).
 */
export async function fetchPhotoByType(
  typeCode: string,
  excludeRegistration: string | null,
): Promise<SamePlaneTypeMatch | null> {
  const cacheKey = `${typeCode}|${excludeRegistration ?? ''}`;
  if (typeCache.has(cacheKey)) return typeCache.get(cacheKey)!;
  try {
    const params = excludeRegistration ? `?exclude=${encodeURIComponent(excludeRegistration)}` : '';
    const token = getToken();
    const res = await fetch(
      `${API_BASE}/api/flights/photo-by-type/${encodeURIComponent(typeCode)}${params}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );
    if (!res.ok) { typeCache.set(cacheKey, null); return null; }
    const json = await res.json() as { photoUrl?: string; registration?: string | null };
    if (!json?.photoUrl) { typeCache.set(cacheKey, null); return null; }
    const match: SamePlaneTypeMatch = {
      url: json.photoUrl,
      registration: json.registration ?? null,
    };
    typeCache.set(cacheKey, match);
    return match;
  } catch {
    typeCache.set(cacheKey, null);
    return null;
  }
}

/** Derive the safe thumbnail_large URL from an upsized URL, for onError fallback. */
export function thumbnailFallback(upsized: string): string {
  return upsized
    .replace('/full_nosym/', '/thumbnail_large/');
}
