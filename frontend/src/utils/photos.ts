// Shared Planespotters photo fetch — module-level cache so results survive re-renders
// and are shared between AircraftPhoto (main view) and LogScreen (detail rows).

type PhotoEntry = {
  thumbnail_large?: { src?: string };
  large?: { src?: string };
};

const cache = new Map<string, string | null>();

function upsizeUrl(url: string): string {
  return url
    .replace('/thumbnail_large/', '/full_nosym/')
    .replace('-thumbnail_large.', '.');
}

/**
 * Fetch the best available photo URL for a registration.
 * Prefers `large` field if present, otherwise tries to upsize the thumbnail_large CDN URL.
 * Falls back to raw thumbnail_large if upsizing produced a bad URL (caller handles onError).
 */
export async function fetchPhoto(registration: string): Promise<string | null> {
  if (cache.has(registration)) return cache.get(registration)!;
  try {
    const res = await fetch(
      `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(registration)}`,
    );
    if (!res.ok) { cache.set(registration, null); return null; }
    const json = await res.json() as { photos?: PhotoEntry[] };
    const photo = json?.photos?.[0];
    const thumb = photo?.thumbnail_large?.src ?? null;
    const src   = photo?.large?.src ?? (thumb ? upsizeUrl(thumb) : null);
    cache.set(registration, src);
    return src;
  } catch {
    cache.set(registration, null);
    return null;
  }
}

/** Derive the safe thumbnail_large URL from an upsized URL, for onError fallback. */
export function thumbnailFallback(upsized: string): string {
  return upsized
    .replace('/full_nosym/', '/thumbnail_large/');
}
