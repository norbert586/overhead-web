// Aircraft photo waterfall: Planespotters → airport-data.com → type-based fallback
// Module-level caches survive re-renders and are shared across all consumers.

export type PhotoTier = 'specific' | 'comparable';

export interface PhotoResult {
  url: string;
  tier: PhotoTier;
}

// Per-registration cache (tiers 1–2 results, keyed by reg)
const regCache  = new Map<string, PhotoResult | null>();
// Per-type cache (tier 3 results, keyed by ICAO type code)
const typeCache = new Map<string, string | null>();

// ── helpers ─────────────────────────────────────────────────────

function upsizePlanespotters(url: string): string {
  return url
    .replace('/thumbnail_large/', '/full_nosym/')
    .replace('-thumbnail_large.', '.');
}

/** Derive the safe thumbnail_large URL from an upsized Planespotters URL — used by LogScreen. */
export function thumbnailFallback(upsized: string): string {
  return upsized.replace('/full_nosym/', '/thumbnail_large/');
}

type PSPhoto = { thumbnail_large?: { src?: string }; large?: { src?: string } };

function bestPlanespottersUrl(photo: PSPhoto): string | null {
  const thumb = photo?.thumbnail_large?.src ?? null;
  return photo?.large?.src ?? (thumb ? upsizePlanespotters(thumb) : null);
}

// ── Tier 1: Planespotters by registration ────────────────────────

async function fromPlanespotters(reg: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(reg)}`,
    );
    if (!res.ok) return null;
    const json = await res.json() as { photos?: PSPhoto[] };
    const photo = json?.photos?.[0];
    return photo ? bestPlanespottersUrl(photo) : null;
  } catch {
    return null;
  }
}

// ── Tier 2: airport-data.com by registration ─────────────────────

async function fromAirportData(reg: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.airport-data.com/api/ac_thumb.json?m=${encodeURIComponent(reg)}&n=1`,
    );
    if (!res.ok) return null;
    const json = await res.json() as { data?: { image?: string }[] };
    return json?.data?.[0]?.image ?? null;
  } catch {
    return null;
  }
}

// ── Tier 3: Planespotters by ICAO type code (comparable aircraft) ─

async function fromPlanespottersByType(typeCode: string): Promise<string | null> {
  if (typeCache.has(typeCode)) return typeCache.get(typeCode)!;
  try {
    const res = await fetch(
      `https://api.planespotters.net/pub/photos/icao/${encodeURIComponent(typeCode)}`,
    );
    if (!res.ok) { typeCache.set(typeCode, null); return null; }
    const json = await res.json() as { photos?: PSPhoto[] };
    const photo = json?.photos?.[0];
    const url = photo ? bestPlanespottersUrl(photo) : null;
    typeCache.set(typeCode, url);
    return url;
  } catch {
    typeCache.set(typeCode, null);
    return null;
  }
}

// ── Main waterfall ───────────────────────────────────────────────

export async function fetchPhotoWaterfall(
  registration: string | null,
  typeCode: string | null,
): Promise<PhotoResult | null> {
  if (!registration) return null;

  if (regCache.has(registration)) {
    const cached = regCache.get(registration)!;
    console.log(`[photo] ${registration} → cache hit:`, cached ?? 'null');
    return cached;
  }

  console.log(`[photo] ${registration} — starting waterfall (type: ${typeCode ?? 'unknown'})`);

  // Tier 1 — Planespotters, specific aircraft
  const t1 = await fromPlanespotters(registration);
  if (t1) {
    console.log(`[photo] ${registration} → tier 1 HIT (Planespotters):`, t1);
    const result: PhotoResult = { url: t1, tier: 'specific' };
    regCache.set(registration, result);
    return result;
  }
  console.log(`[photo] ${registration} → tier 1 miss (Planespotters)`);

  // Tier 2 — airport-data.com, specific aircraft
  const t2 = await fromAirportData(registration);
  if (t2) {
    console.log(`[photo] ${registration} → tier 2 HIT (airport-data.com):`, t2);
    const result: PhotoResult = { url: t2, tier: 'specific' };
    regCache.set(registration, result);
    return result;
  }
  console.log(`[photo] ${registration} → tier 2 miss (airport-data.com)`);

  // Tier 3 — Planespotters by type code, comparable aircraft
  if (typeCode) {
    const t3 = await fromPlanespottersByType(typeCode);
    if (t3) {
      console.log(`[photo] ${registration} → tier 3 HIT (comparable, type ${typeCode}):`, t3);
      const result: PhotoResult = { url: t3, tier: 'comparable' };
      regCache.set(registration, result);
      return result;
    }
    console.log(`[photo] ${registration} → tier 3 miss (no type photo for ${typeCode})`);
  } else {
    console.log(`[photo] ${registration} → tier 3 skipped (no type code)`);
  }

  console.log(`[photo] ${registration} → all tiers exhausted — no intel`);
  regCache.set(registration, null);
  return null;
}

// ── Backward-compat shim for LogScreen ──────────────────────────
// Runs tiers 1–2 only (no type fallback needed for log row thumbnails).

export async function fetchPhoto(registration: string): Promise<string | null> {
  const cached = regCache.get(registration);
  if (cached !== undefined) return cached?.url ?? null;

  const t1 = await fromPlanespotters(registration);
  if (t1) { regCache.set(registration, { url: t1, tier: 'specific' }); return t1; }

  const t2 = await fromAirportData(registration);
  if (t2) { regCache.set(registration, { url: t2, tier: 'specific' }); return t2; }

  regCache.set(registration, null);
  return null;
}
