// Tiny stale-while-revalidate cache backed by sessionStorage.
//
// Screens paint instantly from the last known data (no loading flash when you
// come back to Stats or the Log) while a background fetch refreshes it. Keys
// are scoped to the signed-in user so a shared tab never shows someone else's
// numbers, and to a schema version so shape changes invalidate old entries.

import { getToken } from '../hooks/useAuth';

const VERSION = 'v2';

function userScope(): string {
  try {
    const raw = localStorage.getItem('overhead_user');
    if (!raw) return 'anon';
    const parsed = JSON.parse(raw) as { id?: number };
    return String(parsed.id ?? 'anon');
  } catch {
    return 'anon';
  }
}

function storageKey(key: string): string {
  return `overhead-swr:${VERSION}:${userScope()}:${key}`;
}

export function readCache<T>(key: string): T | null {
  if (!getToken()) return null; // signed out — never serve cached data
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(data));
  } catch {
    // Storage full or unavailable — stale-while-revalidate simply degrades
    // to fetch-on-mount.
  }
}
