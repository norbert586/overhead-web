// Aircraft photos for the UI. The server does the searching (see backend
// services/photos.ts): one request returns every photo worth trying, best
// first, with credits and where the aircraft sits in each one.
//
// The browser only searches by itself when the server couldn't: our server
// unreachable, or it reports a provider it couldn't ask (complete: false). Then
// we ask Planespotters directly. Browsers have their own IPs, so this still
// works if the server ever gets rate-limited.

import { getToken } from '../hooks/useAuth';
import type { PhotoCandidate, PhotoResult } from '../types/photo';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 300;
const REQUEST_TIMEOUT_MS = 12_000;

export interface PhotoSubject {
  hex: string | null;
  registration: string | null;
  aircraftType: string | null;
  callsign?: string | null;
}

const cache = new Map<string, { at: number; result: Promise<PhotoResult> }>();

const keyOf = (s: PhotoSubject) =>
  [s.hex, s.registration, s.aircraftType, s.callsign].map((v) => (v ?? '').trim().toUpperCase()).join('|');

async function fromServer(s: PhotoSubject): Promise<PhotoResult> {
  const q = new URLSearchParams();
  if (s.hex) q.set('hex', s.hex);
  if (s.registration) q.set('reg', s.registration);
  if (s.aircraftType) q.set('type', s.aircraftType);
  if (s.callsign?.trim()) q.set('callsign', s.callsign.trim());
  const token = getToken();
  // /api/photos never answers 401 (it's public), so a stale token can't sign
  // anyone out from here; sending it just lifts the guest rate limit.
  const res = await fetch(`${API_BASE}/api/photos?${q}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`photos HTTP ${res.status}`);
  const body = await res.json() as PhotoResult;
  return { candidates: Array.isArray(body?.candidates) ? body.candidates : [], complete: body?.complete !== false };
}

interface PlanespottersPhoto {
  thumbnail?: { src?: string; size?: { width?: number; height?: number } };
  thumbnail_large?: { src?: string; size?: { width?: number; height?: number } };
  link?: string;
  photographer?: string;
}

/** Planespotters straight from the browser (their API is CORS-enabled). */
async function fromPlanespotters(s: PhotoSubject): Promise<PhotoCandidate | null> {
  for (const [kind, id] of [['reg', s.registration], ['hex', s.hex]] as const) {
    if (!id) continue;
    try {
      const res = await fetch(`https://api.planespotters.net/pub/photos/${kind}/${encodeURIComponent(id)}`, {
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) continue;
      const body = await res.json() as { photos?: PlanespottersPhoto[] };
      const p = body.photos?.[0];
      const img = p?.thumbnail_large?.src ? p.thumbnail_large : p?.thumbnail;
      if (!p || !img?.src || !p.link) continue;
      return {
        url: img.src,
        width: img.size?.width ?? null,
        height: img.size?.height ?? null,
        provider: 'planespotters',
        match: 'exact',
        link: p.link,
        photographer: p.photographer ?? null,
        license: null,
        registration: null,
        sameAirline: false,
        focus: null,
      };
    } catch { /* try the next identifier */ }
  }
  return null;
}

async function resolve(s: PhotoSubject): Promise<PhotoResult> {
  let result: PhotoResult;
  try {
    result = await fromServer(s);
  } catch {
    // Our server is unreachable or failing: the browser asks on its own.
    const direct = await fromPlanespotters(s);
    return { candidates: direct ? [direct] : [], complete: false };
  }
  if (!result.complete && !result.candidates.some((c) => c.match === 'exact')) {
    const direct = await fromPlanespotters(s);
    if (direct) result = { ...result, candidates: [direct, ...result.candidates] };
  }
  return result;
}

/**
 * Every photo worth trying for this aircraft, best first. Cached for ten
 * minutes per aircraft; concurrent callers share one request.
 */
export function resolvePhotos(s: PhotoSubject): Promise<PhotoResult> {
  const key = keyOf(s);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;
  const result = resolve(s);
  cache.set(key, { at: Date.now(), result });
  // A result that came back incomplete is worth asking again sooner.
  result.then((r) => {
    if (!r.complete) setTimeout(() => { if (cache.get(key)?.result === result) cache.delete(key); }, 60_000);
  }).catch(() => cache.delete(key));
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return result;
}

/** Warm the cache and the browser's image cache for aircraft about to be shown. */
export function prefetchPhotos(subjects: PhotoSubject[]): void {
  for (const s of subjects) {
    if (!s.hex && !s.registration && !s.aircraftType) continue;
    resolvePhotos(s).then((r) => {
      const first = r.candidates[0];
      if (first) new Image().src = first.url;
    }).catch(() => {});
  }
}

const reported = new Set<string>();

/** Tell the server an image wouldn't load; it re-checks and purges dead ones. */
export function reportBrokenPhoto(url: string): void {
  if (reported.has(url) || !navigator.onLine) return;
  reported.add(url);
  fetch(`${API_BASE}/api/photos/broken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    keepalive: true,
  }).catch(() => {});
}

const PROVIDER_NAMES: Record<PhotoCandidate['provider'], string> = {
  planespotters: 'Planespotters',
  'airport-data': 'Airport-Data',
  wikimedia: 'Wikimedia',
};

/** Visible photographer credit (Planespotters' terms; CC attribution for Commons). */
export function photoCredit(c: PhotoCandidate): string {
  const parts = [c.photographer ? `© ${c.photographer}` : null, c.license, PROVIDER_NAMES[c.provider]];
  return parts.filter(Boolean).join(' · ');
}

/** Says plainly when the photo is not of this very airframe; null when it is. */
export function photoMatchLabel(c: PhotoCandidate, aircraftType: string | null): string | null {
  if (c.match === 'exact') return null;
  if (c.provider === 'wikimedia') return `Reference photo${aircraftType ? ` · ${aircraftType}` : ''}`;
  const reg = c.registration ? ` · ${c.registration}` : '';
  return c.sameAirline ? `Same airline & model${reg}` : `Same model${reg}`;
}

/** Where to look by hand when nothing turned up. */
export function photoSearchUrl(registration: string | null): string | null {
  return registration ? `https://www.planespotters.net/photos/reg/${encodeURIComponent(registration)}` : null;
}
