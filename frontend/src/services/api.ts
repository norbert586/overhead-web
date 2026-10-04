// Overhead — API Service
// Wraps all calls to the Overhead backend.

import type { Flight, FlightsResponse } from '../types/flight';
import type { AchievementsResponse, RankResponse } from '../types/achievements';
import type {
  StatsSummaryData,
  StatsAltitudeData,
  StatsActivityData,
  StatsAircraftTypesData,
  StatsOperatorsData,
  StatsCountriesData,
  StatsRoutesData,
  StatsNotableData,
  StatsMostSeenData,
} from '../types/stats';
import type { AuthUser } from '../hooks/useAuth';
import { getToken } from '../hooks/useAuth';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/** Fired on window when any authenticated call comes back 401. App signs out. */
export const AUTH_EXPIRED_EVENT = 'overhead:auth-expired';

/**
 * What went wrong, in terms the UI can act on:
 * - offline       — the request never reached us (no signal, airplane mode)
 * - timeout       — reached the network but no answer in time
 * - auth          — session expired or invalid; sign in again
 * - rate-limited  — slow down (guests); retryAfterSec says how long
 * - upstream      — our server is fine, the live ADS-B feeds are not
 * - server        — our server (or the proxy in front of it) is failing
 */
export type ApiErrorKind = 'offline' | 'timeout' | 'auth' | 'rate-limited' | 'upstream' | 'server';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly retryAfterSec: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, retryAfterSec: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options?.headers ?? {}) },
  });
  // Every caller of apiFetch is an authenticated call, so a 401 means the
  // stored session is no good. Without this, an expired token left the app
  // "signed in" with every screen failing — the catch screen showed it as
  // "flight data unavailable" indefinitely.
  if (res.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  return res;
}

/** Turn a non-OK response into an ApiError with the right kind. */
async function toApiError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
  const retryAfter = Number(res.headers.get('Retry-After'));
  const retryAfterSec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
  const msg = body.error ?? `API error: ${res.status}`;
  if (res.status === 401) return new ApiError('auth', msg, 401);
  if (res.status === 429) return new ApiError('rate-limited', msg, 429, retryAfterSec);
  // Only our API's own JSON 502 means "the feeds are down". A bare 502/503/
  // 504 is nginx or Cloudflare saying the backend itself is unreachable
  // (deploy restart, crash) — a different message and a different fix.
  if (res.status === 502 && body.code === 'upstream_unavailable') {
    return new ApiError('upstream', msg, 502, retryAfterSec);
  }
  return new ApiError('server', msg, res.status, retryAfterSec);
}

export async function fetchFlights(
  lat: number,
  lon: number,
  radius: number,
  record = true,
  signal?: AbortSignal,
): Promise<FlightsResponse> {
  const recordParam = record ? '' : '&record=false';
  let res: Response;
  try {
    res = await apiFetch(
      `${BASE_URL}/api/flights?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&radius=${radius}${recordParam}`,
      { signal, cache: 'no-store' },
    );
  } catch (err) {
    // Aborts are the caller's business (timeout or superseded poll).
    if ((err as Error).name === 'AbortError') throw err;
    // fetch only rejects when no response arrived at all — no signal, a
    // dropped mobile connection, or the site unreachable from here.
    throw new ApiError('offline', 'Network request failed');
  }
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

/**
 * Sliding sessions: swap a still-valid token for a fresh 30-day one. Returns
 * null on any failure — the caller keeps the token it has.
 */
export async function apiRefreshSession(): Promise<AuthResponse | null> {
  try {
    const res = await apiFetch(`${BASE_URL}/api/auth/refresh`, { method: 'POST' });
    if (!res.ok) return null;
    return await res.json() as AuthResponse;
  } catch {
    return null;
  }
}

async function statsGet<T>(path: string): Promise<T> {
  const res = await apiFetch(`${BASE_URL}/api/stats/${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const fetchStatsSummary      = () => statsGet<StatsSummaryData>('summary');
export const fetchStatsAltitude     = () => statsGet<StatsAltitudeData>('altitude');
export const fetchStatsActivity     = () => statsGet<StatsActivityData>('activity');
export const fetchStatsAircraftTypes= () => statsGet<StatsAircraftTypesData>('aircraft-types');
export const fetchStatsOperators    = () => statsGet<StatsOperatorsData>('operators');
export const fetchStatsCountries    = () => statsGet<StatsCountriesData>('countries');
export const fetchStatsRoutes       = () => statsGet<StatsRoutesData>('routes');
export const fetchStatsNotable      = () => statsGet<StatsNotableData>('notable');
export const fetchStatsMostSeen     = () => statsGet<StatsMostSeenData>('most-seen');


// ── Hangar ────────────────────────────────────────────────────────────────────

export interface HangarData {
  types: Array<{
    aircraftType: string;
    manufacturer: string | null;
    airframes: number;
    catches: number;
    firstCaught: string;
    bestScore: number;
  }>;
  operators: Array<{
    operator: string;
    airframes: number;
    catches: number;
    firstCaught: string;
  }>;
  countries: Array<{
    country: string;
    countryIso: string | null;
    airframes: number;
    catches: number;
    firstCaught: string;
  }>;
}

export const fetchHangar = () => statsGet<HangarData>('hangar');

export async function fetchLog(
  limit: number,
  offset = 0,
  fromDate?: string,
  toDate?: string,
): Promise<{ flights: Flight[]; total: number }> {
  let url = `${BASE_URL}/api/log?limit=${limit}&offset=${offset}`;
  if (fromDate) url += `&from=${encodeURIComponent(fromDate)}`;
  if (toDate)   url += `&to=${encodeURIComponent(toDate)}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Login failed (${res.status})`);
  }
  return res.json();
}

export async function apiRegister(
  email: string,
  password: string,
  inviteCode: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, inviteCode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Registration failed (${res.status})`);
  }
  return res.json();
}

export async function apiForgotPassword(email: string): Promise<void> {
  // Backend always returns 200 — we just need to know the request landed.
  await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function apiResetPassword(
  token: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Password reset failed (${res.status})`);
  }
  return res.json();
}

export async function apiVerifyEmail(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Verification failed (${res.status})`);
  }
}

export async function apiResendVerification(): Promise<void> {
  const res = await apiFetch(`${BASE_URL}/api/auth/resend-verification`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Failed to resend verification email (${res.status})`);
  }
}

// ── User profile ──────────────────────────────────────────────────────────────

export interface UserProfile {
  id: number;
  email: string;
  createdAt: string;
  isAdmin: boolean;
  emailVerified: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusNm: number;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminOverview {
  totalUsers: number;
  adminUsers: number;
  usersWithLocation: number;
  newUsers24h: number;
  newUsers7d: number;
  totalFlights: number;
  uniqueAircraftAllUsers: number;
  flights24h: number;
  cachedAircraft: number;
  cachedCallsigns: number;
}

export interface AdminUser {
  id: number;
  email: string;
  createdAt: string;
  isAdmin: boolean;
  hasLocation: boolean;
  totalFlights: number;
  uniqueAircraft: number;
  lastSeenAt: string | null;
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const res = await apiFetch(`${BASE_URL}/api/admin/overview`);
  if (!res.ok) throw new Error(`Admin overview failed (${res.status})`);
  return res.json();
}

export async function fetchAdminUsers(): Promise<{ users: AdminUser[] }> {
  const res = await apiFetch(`${BASE_URL}/api/admin/users`);
  if (!res.ok) throw new Error(`Admin users fetch failed (${res.status})`);
  return res.json();
}

export interface AdminResetPasswordResponse {
  userId: number;
  email: string;
  tempPassword: string;
}

export async function adminResetUserPassword(userId: number): Promise<AdminResetPasswordResponse> {
  const res = await apiFetch(`${BASE_URL}/api/admin/users/${userId}/reset-password`, {
    method: 'POST',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Password reset failed (${res.status})`);
  }
  return res.json();
}

export async function fetchChangelog(): Promise<{ markdown: string }> {
  const res = await apiFetch(`${BASE_URL}/api/admin/changelog`);
  if (!res.ok) throw new Error(`Changelog fetch failed (${res.status})`);
  return res.json();
}

export async function fetchProfile(): Promise<UserProfile> {
  const res = await apiFetch(`${BASE_URL}/api/user/profile`);
  if (!res.ok) throw new Error(`Profile fetch failed (${res.status})`);
  return res.json();
}

export async function updateProfile(settings: {
  latitude: number | null;
  longitude: number | null;
  radiusNm: number;
}): Promise<UserProfile> {
  const res = await apiFetch(`${BASE_URL}/api/user/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Profile update failed (${res.status})`);
  return res.json();
}

export async function fetchAchievements(): Promise<AchievementsResponse> {
  const res = await apiFetch(`${BASE_URL}/api/user/achievements`);
  if (!res.ok) throw new Error(`Achievements fetch failed (${res.status})`);
  return res.json();
}

export async function fetchRank(): Promise<RankResponse> {
  const res = await apiFetch(`${BASE_URL}/api/user/rank`);
  if (!res.ok) throw new Error(`Rank fetch failed (${res.status})`);
  return res.json();
}
