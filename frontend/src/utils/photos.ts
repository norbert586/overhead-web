// Shared Planespotters photo fetch — module-level cache so results survive re-renders
// and are shared between AircraftPhoto (main view) and LogScreen (detail rows).

type PhotoEntry = {
  thumbnail_large?: { src?: string };
  large?: { src?: string };
};

const cache     = new Map<string, string | null>();
const typeCache = new Map<string, string | null>();

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

/** Similar-planes fallback: Planespotters by ICAO aircraft type code. */
export async function fetchPhotoByType(typeCode: string): Promise<string | null> {
  if (typeCache.has(typeCode)) return typeCache.get(typeCode)!;
  try {
    const res = await fetch(
      `https://api.planespotters.net/pub/photos/type/${encodeURIComponent(typeCode)}`,
    );
    if (!res.ok) { typeCache.set(typeCode, null); return null; }
    const json = await res.json() as { photos?: PhotoEntry[] };
    const src = bestSrc(json?.photos?.[0]);
    typeCache.set(typeCode, src);
    return src;
  } catch {
    typeCache.set(typeCode, null);
    return null;
  }
}

/** Derive the safe thumbnail_large URL from an upsized URL, for onError fallback. */
export function thumbnailFallback(upsized: string): string {
  return upsized
    .replace('/full_nosym/', '/thumbnail_large/');
}
