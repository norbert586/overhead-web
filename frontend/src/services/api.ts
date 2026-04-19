// Overhead — API Service
// Wraps all calls to the Overhead backend.

import type { Flight, FlightsResponse } from '../types/flight';
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

const BASE_URL = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:3001`;

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options?.headers ?? {}) },
  });
  return res;
}

export async function fetchFlights(
  lat: number,
  lon: number,
  radius: number,
): Promise<FlightsResponse> {
  const res = await apiFetch(`${BASE_URL}/api/flights?lat=${lat}&lon=${lon}&radius=${radius}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
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

export async function fetchLog(
  limit: number,
  offset = 0,
): Promise<{ flights: Flight[]; total: number }> {
  const res = await apiFetch(`${BASE_URL}/api/log?limit=${limit}&offset=${offset}`);
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
