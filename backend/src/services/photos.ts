// Aircraft photos, resolved on the server.
//
// This used to be a waterfall in every browser: up to eight sequential
// requests per aircraft (Planespotters by reg, by hex, our type pool, three
// sibling airframes…), repeated by every user for the same aircraft, with no
// credit or link for the photographer and no idea where the aircraft sat in
// the frame. Now one request asks the server, which:
//
//   1. looks for the actual airframe — Planespotters (by registration, then
//      ICAO hex) and Airport-Data in parallel — and caches the answer per
//      airframe for every user;
//   2. if there is none, shows the same model: another airframe from our own
//      pool, preferring the same airline (same livery), else a sibling
//      airframe we've seen, looked up on demand;
//   3. always appends a freely licensed reference photo of the type from
//      Wikimedia Commons as the last resort, so a broken image URL still has
//      somewhere to fall back to;
//   4. finds the aircraft in each photo (photoFocus.ts) so the client can
//      frame it instead of centre-cropping.
//
// The client walks the candidates in order when an image fails to load and
// shows "no photo" only when every one has failed.
//
// Terms we work within: Planespotters thumbnails are shown unchanged (never
// rewritten to a larger size), linked to their photo page, with the
// photographer credited. Wikimedia images carry author + licence. Every
// request identifies us with a User-Agent.

import { get, run, all } from '../database/db';
import { logger } from '../logger';
import { analyzeJpeg, type FocusBox } from './photoFocus';
import { TYPE_NAMES } from './aircraftTypeNames';

const log = logger.child({ module: 'photos' });

// Base URLs are overridable so scripts/mock-adsb.mjs can stand in offline.
const PLANESPOTTERS = process.env.PLANESPOTTERS_BASE_URL ?? 'https://api.planespotters.net/pub/photos';
const AIRPORT_DATA = process.env.AIRPORT_DATA_BASE_URL ?? 'https://airport-data.com/api';
const WIKIPEDIA = process.env.WIKIPEDIA_API_URL ?? 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'Overhead/1.0 (+https://overheadflight.com)';
// Real providers serve https only; plain http is accepted just for local mocks.
const ALLOW_HTTP = [PLANESPOTTERS, AIRPORT_DATA, WIKIPEDIA].some((b) => b.startsWith('http:'));

const API_TIMEOUT_MS = 5_000;
const IMAGE_TIMEOUT_MS = 6_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Re-check an airframe daily: photos are added, removed and replaced, and a
// day-old answer is all Planespotters' public API is meant to stand in for.
const AIRFRAME_TTL_MS = DAY;
const AIRFRAME_MISS_TTL_MS = 12 * HOUR;
const TYPE_TTL_MS = 30 * DAY;
const TYPE_MISS_TTL_MS = 3 * DAY;
// Pool photos stand in for other airframes; older rows may point at removed photos.
const POOL_MAX_AGE_MS = 30 * DAY;
const TRANSIENT_RETRY_MS = 2 * 60_000;
// How long a lookup waits for the first photo's framing before answering
// without it (the analysis still finishes and is cached for next time).
const FOCUS_BUDGET_MS = 1_500;

export type PhotoProvider = 'planespotters' | 'airport-data' | 'wikimedia';

export interface PhotoCandidate {
  url: string;
  width: number | null;
  height: number | null;
  provider: PhotoProvider;
  /** 'exact': this very airframe. 'type': the same model — another airframe, or a reference photo. */
  match: 'exact' | 'type';
  /** The photo's own page: required link-back (Planespotters) / attribution (Commons). */
  link: string | null;
  photographer: string | null;
  license: string | null;
  /** For a 'type' match from another airframe: its registration. */
  registration: string | null;
  /** For a 'type' match: flown by the same airline, so the livery matches. */
  sameAirline: boolean;
  /** Where the aircraft is in the photo; null = unknown, frame the whole photo. */
  focus: FocusBox | null;
}

export interface PhotoLookup {
  hex: string | null;
  registration: string | null;
  aircraftType: string | null;
  /** ICAO airline designator (from the callsign), for livery-matched stand-ins. */
  airline: string | null;
}

export interface PhotoResult {
  candidates: PhotoCandidate[];
  /**
   * False when an airframe provider couldn't be asked (down, rate-limited,
   * breaker open) — "no exact photo" may then be wrong, and the client is
   * free to try Planespotters itself.
   */
  complete: boolean;
}

class TransientError extends Error {}

// ── Provider gates: concurrency cap + circuit breaker + health ──────────────

const BREAKER_THRESHOLD = 5;
const BREAKER_OPEN_MS = 60_000;

class ProviderGate {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  private consecutiveFailures = 0;
  private openUntil = 0;
  private lastSuccessAt: number | null = null;
  private lastErrorAt: number | null = null;
  private lastError: string | null = null;
  readonly counts = { requests: 0, errors: 0 };

  constructor(readonly name: string, private readonly maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.openUntil > Date.now()) throw new TransientError(`${this.name} paused after repeated failures`);
    if (this.active >= this.maxConcurrent) await new Promise<void>((resolve) => this.queue.push(resolve));
    else this.active += 1;
    this.counts.requests += 1;
    try {
      const value = await fn();
      this.consecutiveFailures = 0;
      this.lastSuccessAt = Date.now();
      return value;
    } catch (err) {
      this.counts.errors += 1;
      this.lastErrorAt = Date.now();
      this.lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof TransientError) {
        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= BREAKER_THRESHOLD && this.openUntil <= Date.now()) {
          this.openUntil = Date.now() + BREAKER_OPEN_MS;
          log.warn({ provider: this.name }, 'photo provider failing — pausing it for 60s');
        }
      }
      throw err;
    } finally {
      const next = this.queue.shift();
      if (next) next(); // hand the slot straight over
      else this.active -= 1;
    }
  }

  status() {
    const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);
    return {
      name: this.name,
      breakerOpen: this.openUntil > Date.now(),
      lastSuccessAt: iso(this.lastSuccessAt),
      lastErrorAt: iso(this.lastErrorAt),
      lastError: this.lastError,
      ...this.counts,
    };
  }
}

const gates = {
  planespotters: new ProviderGate('planespotters', 4),
  airportData: new ProviderGate('airport-data', 3),
  wikimedia: new ProviderGate('wikimedia', 2),
  images: new ProviderGate('image-analysis', 3),
};

const outcomes = { exact: 0, sameAirline: 0, sameType: 0, reference: 0, none: 0, incomplete: 0 };

async function getJson(gate: ProviderGate, url: string): Promise<unknown | null> {
  return gate.run(async () => {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (err) {
      throw new TransientError(err instanceof Error ? err.message : String(err));
    }
    // "No such aircraft" is an answer; 403/429/5xx are about us or them right now.
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new TransientError(`HTTP ${res.status}`);
    try {
      return await res.json();
    } catch {
      // A bot wall answering 200 with HTML.
      throw new TransientError('response was not JSON');
    }
  });
}

function validUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 600) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || (ALLOW_HTTP && u.protocol === 'http:');
  } catch {
    return false;
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Plain text from a provider-supplied name (Commons' Artist field is HTML). */
function cleanText(raw: unknown, max = 80): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const positiveInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

function candidate(fields: Partial<PhotoCandidate> & Pick<PhotoCandidate, 'url' | 'provider' | 'match'>): PhotoCandidate {
  return {
    width: null, height: null, link: null, photographer: null, license: null,
    registration: null, sameAirline: false, focus: null,
    ...fields,
  };
}

// ── Providers ───────────────────────────────────────────────────────────────

interface PlanespottersPhoto {
  thumbnail?: { src?: string; size?: { width?: number; height?: number } };
  thumbnail_large?: { src?: string; size?: { width?: number; height?: number } };
  link?: string;
  photographer?: string;
}

async function planespotters(kind: 'reg' | 'hex', id: string): Promise<PhotoCandidate | null> {
  const body = await getJson(gates.planespotters, `${PLANESPOTTERS}/${kind}/${encodeURIComponent(id)}`) as
    { photos?: PlanespottersPhoto[] } | null;
  const photo = Array.isArray(body?.photos) ? body.photos[0] : undefined;
  // thumbnail_large (~420×280) is the largest size the API offers, and its
  // URL may not be rewritten for a bigger one.
  const img = validUrl(photo?.thumbnail_large?.src) ? photo.thumbnail_large : photo?.thumbnail;
  if (!photo || !validUrl(img?.src) || !validUrl(photo.link)) return null;
  return candidate({
    url: img.src,
    width: positiveInt(img.size?.width),
    height: positiveInt(img.size?.height),
    provider: 'planespotters',
    match: 'exact',
    link: photo.link,
    photographer: cleanText(photo.photographer),
  });
}

/** Planespotters by registration, then by hex (photos are tagged with either). */
async function planespottersAirframe(reg: string | null, hex: string | null): Promise<PhotoCandidate | null> {
  let failure: unknown = null;
  for (const [kind, id] of [['reg', reg], ['hex', hex]] as const) {
    if (!id) continue;
    try {
      const hit = await planespotters(kind, id);
      if (hit) return hit;
    } catch (err) {
      failure = err;
    }
  }
  if (failure) throw failure;
  return null;
}

const photoId = (u: string | null | undefined) => u?.match(/(\d{3,})\.jpe?g(?:[?#]|$)/i)?.[1] ?? null;

/**
 * Airport-Data, which is also where adsbdb's registry photo comes from. Its
 * API gives the credit and photo page; adsbdb's URL is the full-size image.
 * They're paired only when they're provably the same photo.
 */
async function airportData(hex: string | null, reg: string | null, registryPhoto: string | null): Promise<PhotoCandidate | null> {
  const fromRegistry = registryPhoto
    ? candidate({ url: registryPhoto, provider: 'airport-data', match: 'exact' })
    : null;
  if (!hex) return fromRegistry;
  const q = new URLSearchParams({ m: hex.toUpperCase(), n: '1' });
  if (reg) q.set('r', reg);
  let body: { status?: number; data?: { image?: string; link?: string; photographer?: string }[] } | null;
  try {
    body = await getJson(gates.airportData, `${AIRPORT_DATA}/ac_thumb.json?${q}`) as typeof body;
  } catch (err) {
    if (fromRegistry) return fromRegistry;
    throw err;
  }
  const hit = body?.status === 200 && Array.isArray(body.data) ? body.data[0] : undefined;
  if (!hit || !validUrl(hit.image)) return fromRegistry;
  const samePhoto = !!registryPhoto && photoId(registryPhoto) !== null && photoId(registryPhoto) === photoId(hit.image);
  return candidate({
    url: samePhoto ? registryPhoto : hit.image,
    provider: 'airport-data',
    match: 'exact',
    link: validUrl(hit.link) ? hit.link : null,
    photographer: cleanText(hit.photographer),
  });
}

// Words a Wikipedia short description of an aircraft type uses — guards the
// search fallback against landing on a company, an airport or a disambiguation page.
const AIRCRAFT_WORDS = /aircraft|airliner|airplane|aeroplane|helicopter|\bjets?\b|airlifter|transport|fighter|bomber|trainer|tanker|turboprop|rotorcraft|seaplane|amphibi|airship|glider|biplane|monoplane|tiltrotor|gyroplane/i;

interface WikiPage {
  title?: string;
  missing?: boolean;
  index?: number;
  description?: string;
  pageimage?: string;
  imagerepository?: string;
  imageinfo?: {
    url?: string; width?: number; height?: number; mime?: string;
    thumburl?: string; thumbwidth?: number; thumbheight?: number;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
}

async function wikiQuery(params: Record<string, string>): Promise<WikiPage[]> {
  const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params });
  const body = await getJson(gates.wikimedia, `${WIKIPEDIA}?${q}`) as { query?: { pages?: WikiPage[] } } | null;
  return Array.isArray(body?.query?.pages) ? body.query.pages : [];
}

/** A Commons (freely licensed) JPEG with its credit, sized for a hero. */
async function commonsPhoto(fileName: string): Promise<PhotoCandidate | null> {
  const [page] = await wikiQuery({
    titles: `File:${fileName}`,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1280',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  const info = page?.imageinfo?.[0];
  // 'shared' = hosted on Commons, i.e. free. Locally hosted lead images are
  // usually non-free. Photos only: lead PNG/SVGs are diagrams and logos.
  if (!info || page.imagerepository !== 'shared' || info.mime !== 'image/jpeg') return null;
  const url = info.thumburl ?? info.url;
  if (!validUrl(url)) return null;
  return candidate({
    url,
    width: positiveInt(info.thumbwidth ?? info.width),
    height: positiveInt(info.thumbheight ?? info.height),
    provider: 'wikimedia',
    match: 'type',
    link: validUrl(info.descriptionurl) ? info.descriptionurl : null,
    photographer: cleanText(info.extmetadata?.Artist?.value),
    license: cleanText(info.extmetadata?.LicenseShortName?.value, 40),
  });
}

/** The lead photo of the type's Wikipedia article. */
async function wikimediaTypePhoto(names: string[]): Promise<PhotoCandidate | null> {
  const props = { prop: 'pageimages|description', piprop: 'name' };
  for (const name of names) {
    // The name as a title first (redirects resolve "Boeing 737-800" to its
    // article); a page that says it's something else falls through to search.
    const [direct] = await wikiQuery({ titles: name, redirects: '1', ...props });
    let page: WikiPage | undefined =
      direct && !direct.missing && direct.pageimage && (!direct.description || AIRCRAFT_WORDS.test(direct.description))
        ? direct : undefined;
    if (!page) {
      const found = await wikiQuery({ generator: 'search', gsrsearch: name, gsrlimit: '3', gsrnamespace: '0', ...props });
      page = found
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .find((p) => p.pageimage && AIRCRAFT_WORDS.test(p.description ?? ''));
    }
    if (!page?.pageimage) continue;
    const photo = await commonsPhoto(page.pageimage);
    if (photo) return photo;
  }
  return null;
}

// ── Caches ──────────────────────────────────────────────────────────────────

interface AirframeRow extends Record<string, unknown> {
  hex: string;
  registration: string | null;
  candidates: string;
  checked_at: number;
}

function parseCandidates(json: string | null): PhotoCandidate[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as PhotoCandidate[]).filter((c) => validUrl(c?.url)) : [];
  } catch {
    return [];
  }
}

/** Strip per-request fields before storing. */
const forStorage = (cs: PhotoCandidate[]) => JSON.stringify(cs.map((c) => ({ ...c, focus: null })));

/** adsbdb's photo for this registration (an Airport-Data image), if any. */
function registryPhotoFor(registration: string): string | null {
  const row = get<{ photo_url: string | null }>(
    'SELECT photo_url FROM aircraft_cache WHERE registration = ?', [registration]);
  const url = row?.photo_url ?? null;
  // Older builds stored client-found Planespotters URLs here — those are
  // not Airport-Data's and carry no credit, so they don't count.
  if (!validUrl(url) || /plnspttrs\.net|planespotters\.net/i.test(url)) return null;
  return url;
}

/** "Manufacturer model" from the registry, as a fallback search name. */
function registryNameFor(registration: string | null): string | null {
  if (!registration) return null;
  const row = get<{ manufacturer: string | null; aircraft_type: string | null }>(
    'SELECT manufacturer, aircraft_type FROM aircraft_cache WHERE registration = ?', [registration]);
  const make = row?.manufacturer?.trim();
  const model = row?.aircraft_type?.trim();
  return make && model ? `${make} ${model}` : null;
}

// ── Resolution ──────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();
// key → retry-after + whatever partial answer we got, so a failing provider
// isn't asked again on every request for the next couple of minutes.
const transient = new Map<string, { retryAt: number; candidates: PhotoCandidate[] }>();

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function rememberTransient(key: string, candidates: PhotoCandidate[]): void {
  if (transient.size > 5_000) transient.clear();
  transient.set(key, { retryAt: Date.now() + TRANSIENT_RETRY_MS, candidates });
}

/** Photos of this exact airframe, best first. Cached per airframe for everyone. */
async function resolveAirframe(
  lookup: Pick<PhotoLookup, 'hex' | 'registration' | 'aircraftType' | 'airline'>,
): Promise<PhotoResult> {
  const { hex, registration } = lookup;
  if (!hex && !registration) return { candidates: [], complete: true };
  const key = hex ?? `reg:${registration}`;

  const row = get<AirframeRow>('SELECT hex, registration, candidates, checked_at FROM airframe_photos WHERE hex = ?', [key]);
  const cached = row ? parseCandidates(row.candidates) : [];
  // A different registration on the same hex means it was re-registered.
  const sameAirframe = row && (!registration || !row.registration || row.registration === registration);
  if (row && sameAirframe && Date.now() - row.checked_at < (cached.length ? AIRFRAME_TTL_MS : AIRFRAME_MISS_TTL_MS)) {
    return { candidates: cached, complete: true };
  }
  const memo = transient.get(key);
  if (memo && memo.retryAt > Date.now()) {
    return { candidates: memo.candidates.length ? memo.candidates : sameAirframe ? cached : [], complete: false };
  }

  return dedupe(`airframe:${key}`, async () => {
    const registryPhoto = registration ? registryPhotoFor(registration) : null;
    const settled = await Promise.allSettled([
      planespottersAirframe(registration, hex),
      airportData(hex, registration, registryPhoto),
    ]);
    const found = settled.flatMap((s) => (s.status === 'fulfilled' && s.value ? [s.value] : []));
    const failed = settled.some((s) => s.status === 'rejected');
    if (failed) {
      // Can't tell "no photo" from "couldn't ask" — don't record a miss, and
      // keep serving what we had rather than nothing.
      const usable = found.length ? found : sameAirframe ? cached : [];
      rememberTransient(key, usable);
      return { candidates: usable, complete: false };
    }
    transient.delete(key);
    run(
      `INSERT INTO airframe_photos (hex, registration, aircraft_type, airline, candidates, checked_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(hex) DO UPDATE SET
         registration  = excluded.registration,
         aircraft_type = COALESCE(excluded.aircraft_type, airframe_photos.aircraft_type),
         airline       = COALESCE(excluded.airline, airframe_photos.airline),
         candidates    = excluded.candidates,
         checked_at    = excluded.checked_at`,
      [key, registration, lookup.aircraftType, lookup.airline, forStorage(found), Date.now()],
    );
    return { candidates: found, complete: true };
  });
}

/** A photo of another airframe of this type from the shared pool. */
function poolPhoto(type: string, airline: string | null, excludeKey: string, sameAirlineOnly: boolean): PhotoCandidate | null {
  if (sameAirlineOnly && !airline) return null;
  const row = get<{ candidates: string; registration: string | null; airline: string | null }>(
    `SELECT candidates, registration, airline FROM airframe_photos
      WHERE aircraft_type = ? AND hex != ? AND candidates != '[]' AND checked_at > ?
        ${sameAirlineOnly ? 'AND airline = ?' : ''}
      ORDER BY (airline IS NOT NULL AND airline = ?) DESC, checked_at DESC
      LIMIT 1`,
    sameAirlineOnly
      ? [type, excludeKey, Date.now() - POOL_MAX_AGE_MS, airline, airline]
      : [type, excludeKey, Date.now() - POOL_MAX_AGE_MS, airline ?? ''],
  );
  const best = parseCandidates(row?.candidates ?? null)[0];
  if (!row || !best) return null;
  return {
    ...best,
    match: 'type',
    registration: row.registration,
    sameAirline: !!airline && row.airline === airline,
    focus: null,
  };
}

/**
 * Look up airframes of this type that we've seen but never checked, same
 * airline first. Each lookup lands in the pool whatever the outcome.
 */
async function siblingPhoto(type: string, airline: string | null, excludeKey: string): Promise<PhotoCandidate | null> {
  const siblings = all<{ hex: string; registration: string | null; airline: string | null; same: number }>(
    `SELECT hex, MAX(registration) AS registration,
            MAX(CASE WHEN callsign GLOB '[A-Z][A-Z][A-Z][0-9]*' THEN substr(callsign, 1, 3) END) AS airline,
            MAX(CASE WHEN substr(callsign, 1, 3) = ? THEN 1 ELSE 0 END) AS same
       FROM flights
      WHERE aircraft_type = ? AND hex != ?
        AND hex NOT IN (SELECT hex FROM airframe_photos WHERE checked_at > ?)
      GROUP BY hex
      ORDER BY same DESC, MAX(last_seen) DESC
      LIMIT 2`,
    [airline ?? '', type, excludeKey, Date.now() - AIRFRAME_MISS_TTL_MS],
  );
  const results = await Promise.all(siblings.map(async (s) => {
    const r = await resolveAirframe({ hex: s.hex, registration: s.registration, aircraftType: type, airline: s.airline });
    const best = r.candidates[0];
    return best ? { ...best, match: 'type' as const, registration: s.registration, sameAirline: s.same === 1 } : null;
  }));
  return results.find((r) => r?.sameAirline) ?? results.find((r) => r) ?? null;
}

async function typeStandIn(type: string, airline: string | null, excludeKey: string): Promise<PhotoCandidate | null> {
  const same = poolPhoto(type, airline, excludeKey, true);
  if (same) return same;
  const any = poolPhoto(type, airline, excludeKey, false);
  if (any) {
    // Good enough to show now; look for a same-livery one for next time.
    if (airline) void siblingPhoto(type, airline, excludeKey).catch(() => {});
    return any;
  }
  return siblingPhoto(type, airline, excludeKey);
}

/** Reference photo of the type (Wikimedia Commons). Cached per type. */
async function resolveTypePhoto(type: string, registration: string | null): Promise<{ photo: PhotoCandidate | null; complete: boolean }> {
  const row = get<{ candidate: string | null; checked_at: number }>(
    'SELECT candidate, checked_at FROM type_photos WHERE aircraft_type = ?', [type]);
  const cached = row?.candidate ? parseCandidates(`[${row.candidate}]`)[0] ?? null : null;
  if (row && Date.now() - row.checked_at < (cached ? TYPE_TTL_MS : TYPE_MISS_TTL_MS)) {
    return { photo: cached, complete: true };
  }
  const key = `type:${type}`;
  const memo = transient.get(key);
  if (memo && memo.retryAt > Date.now()) return { photo: cached, complete: false };

  const names = [...new Set([TYPE_NAMES[type], registryNameFor(registration)].filter((n): n is string => !!n))];
  if (!names.length) return { photo: null, complete: true };

  return dedupe(key, async () => {
    try {
      const photo = await wikimediaTypePhoto(names);
      transient.delete(key);
      run(
        `INSERT INTO type_photos (aircraft_type, candidate, checked_at) VALUES (?, ?, ?)
         ON CONFLICT(aircraft_type) DO UPDATE SET candidate = excluded.candidate, checked_at = excluded.checked_at`,
        [type, photo ? JSON.stringify({ ...photo, focus: null }) : null, Date.now()],
      );
      return { photo, complete: true };
    } catch (err) {
      if (!(err instanceof TransientError)) log.error({ err, type }, 'type photo lookup failed');
      rememberTransient(key, []);
      return { photo: cached, complete: false };
    }
  });
}

// ── Framing (photoFocus) ────────────────────────────────────────────────────

interface FocusRow extends Record<string, unknown> {
  width: number | null;
  height: number | null;
  box: string | null;
}

function cachedFocus(url: string): FocusRow | undefined {
  return get<FocusRow>('SELECT width, height, box FROM photo_focus WHERE url = ?', [url]);
}

/** Download the image once and find the aircraft in it. Cached per URL for good. */
function analyzePhoto(url: string): Promise<FocusRow | null> {
  return dedupe(`focus:${url}`, () => gates.images.run(async () => {
    let buf: Uint8Array;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/jpeg,image/*' },
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
      });
      if (!res.ok) throw new TransientError(`image HTTP ${res.status}`);
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > MAX_IMAGE_BYTES) throw new Error('image too large');
      buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error('image too large');
    } catch (err) {
      if (err instanceof TransientError) throw err;
      throw new TransientError(err instanceof Error ? err.message : String(err));
    }
    let row: FocusRow;
    try {
      const result = analyzeJpeg(buf);
      row = { width: result.width, height: result.height, box: result.box ? JSON.stringify(result.box) : null };
    } catch (err) {
      // Not a JPEG we can read: remember that, frame the whole photo.
      log.warn({ url, err: err instanceof Error ? err.message : String(err) }, 'photo analysis failed');
      row = { width: null, height: null, box: null };
    }
    run(
      `INSERT INTO photo_focus (url, width, height, box, analyzed_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET width = excluded.width, height = excluded.height,
         box = excluded.box, analyzed_at = excluded.analyzed_at`,
      [url, row.width, row.height, row.box, Date.now()],
    );
    return row;
  }).catch((err) => {
    log.debug({ url, err: err instanceof Error ? err.message : String(err) }, 'photo analysis skipped');
    return null;
  }));
}

function applyFocus(c: PhotoCandidate, row: FocusRow | null | undefined): PhotoCandidate {
  if (!row) return c;
  let box: FocusBox | null = null;
  try { box = row.box ? JSON.parse(row.box) as FocusBox : null; } catch { /* unreadable → whole photo */ }
  return { ...c, focus: box, width: c.width ?? row.width, height: c.height ?? row.height };
}

async function withFocus(candidates: PhotoCandidate[]): Promise<PhotoCandidate[]> {
  // Fallbacks are analysed too, in parallel: when the first image fails to
  // load in the browser, the next one should still be framed. Whatever
  // misses the budget lands in the cache for next time.
  const budget = new Promise<null>((resolve) => setTimeout(() => resolve(null), FOCUS_BUDGET_MS).unref());
  return Promise.all(candidates.map(async (c) => {
    const cached = cachedFocus(c.url);
    if (cached) return applyFocus(c, cached);
    return applyFocus(c, await Promise.race([analyzePhoto(c.url), budget]));
  }));
}

// ── Public API ──────────────────────────────────────────────────────────────

/** ICAO airline designator from an airline-style callsign (UAL123 → UAL). */
export function airlineFromCallsign(callsign: string | null): string | null {
  const m = callsign?.trim().toUpperCase().match(/^([A-Z]{3})\d/);
  return m ? m[1] : null;
}

/** Every photo worth trying for this aircraft, best first. */
export async function resolvePhotos(lookup: PhotoLookup): Promise<PhotoResult> {
  const type = lookup.aircraftType;
  const [airframe, reference] = await Promise.all([
    resolveAirframe(lookup),
    type ? resolveTypePhoto(type, lookup.registration) : Promise.resolve({ photo: null, complete: true }),
  ]);

  const candidates = [...airframe.candidates];
  if (!candidates.length && type) {
    const standIn = await typeStandIn(type, lookup.airline, lookup.hex ?? `reg:${lookup.registration}`);
    if (standIn) candidates.push(standIn);
  }
  if (reference.photo && !candidates.some((c) => c.url === reference.photo!.url)) candidates.push(reference.photo);

  const best = candidates[0];
  if (!best) outcomes.none += 1;
  else if (best.match === 'exact') outcomes.exact += 1;
  else if (best.provider === 'wikimedia') outcomes.reference += 1;
  else if (best.sameAirline) outcomes.sameAirline += 1;
  else outcomes.sameType += 1;
  if (!airframe.complete) outcomes.incomplete += 1;

  return { candidates: await withFocus(candidates), complete: airframe.complete };
}

/**
 * The client couldn't load this image. Check from here before forgetting
 * it — the user's own connection may be the problem — and if the provider
 * really has dropped it, purge it so the next lookup finds a fresh one.
 */
export async function reportBrokenPhoto(url: string): Promise<'purged' | 'ok' | 'unknown'> {
  if (!validUrl(url)) return 'unknown';
  let status: number;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    status = res.status;
    await res.body?.cancel();
  } catch {
    return 'unknown';
  }
  if (status < 400 || status === 416) return 'ok';
  if (![403, 404, 410].includes(status)) return 'unknown';
  const needle = JSON.stringify(url);
  run('DELETE FROM airframe_photos WHERE instr(candidates, ?) > 0', [needle]);
  run('DELETE FROM type_photos WHERE instr(candidate, ?) > 0', [needle]);
  run('DELETE FROM photo_focus WHERE url = ?', [url]);
  log.info({ url, status }, 'purged a photo the provider no longer serves');
  return 'purged';
}

/** Drop framing for photos nobody has asked about in a long while. */
export function prunePhotoCaches(): void {
  run('DELETE FROM photo_focus WHERE analyzed_at < ?', [Date.now() - 90 * DAY]);
  run('DELETE FROM airframe_photos WHERE checked_at < ?', [Date.now() - 90 * DAY]);
}

/** Provider health and lookup outcomes; `withCache` adds table counts (diagnostics only — /api/health stays cheap). */
export function getPhotoStatus(withCache = false) {
  const count = (sql: string) => get<{ n: number }>(sql)?.n ?? 0;
  return {
    providers: Object.values(gates).map((g) => g.status()),
    outcomesSinceStart: { ...outcomes },
    cache: withCache && {
      airframes: count('SELECT COUNT(*) AS n FROM airframe_photos'),
      airframesWithPhoto: count("SELECT COUNT(*) AS n FROM airframe_photos WHERE candidates != '[]'"),
      types: count('SELECT COUNT(*) AS n FROM type_photos'),
      framed: count('SELECT COUNT(*) AS n FROM photo_focus WHERE box IS NOT NULL'),
    },
  };
}

export interface PhotoProbe { name: string; ok: boolean; ms: number; status: number | null; error: string | null }

/** Diagnostics: can the server reach each photo provider right now? Bypasses caches and breakers. */
export async function probePhotoProviders(): Promise<PhotoProbe[]> {
  const probe = async (name: string, url: string, valid: (body: unknown) => boolean): Promise<PhotoProbe> => {
    const started = Date.now();
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      const body = await res.json().catch(() => null) as unknown;
      // A JSON 404 ("no photo for that one") still proves the API answers.
      const ok = (res.ok || res.status === 404) && valid(body);
      return {
        name, ok, ms: Date.now() - started, status: res.status,
        error: ok ? null : res.ok || res.status === 404 ? 'unexpected response shape' : `HTTP ${res.status}`,
      };
    } catch (err) {
      return { name, ok: false, ms: Date.now() - started, status: null, error: err instanceof Error ? err.message : String(err) };
    }
  };
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
  return Promise.all([
    probe('planespotters', `${PLANESPOTTERS}/reg/D-AIMA`, (b) => Array.isArray(obj(b).photos)),
    probe('airport-data', `${AIRPORT_DATA}/ac_thumb.json?m=3C65A1&n=1`, (b) => typeof obj(b).status === 'number'),
    probe('wikimedia', `${WIKIPEDIA}?action=query&format=json&formatversion=2&titles=Boeing%20747&prop=pageimages`,
      (b) => !!obj(b).query),
  ]);
}
