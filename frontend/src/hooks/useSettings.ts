import { useState } from 'react';

export interface Settings {
  /** Fallback catch point for devices without usable GPS. */
  latitude: number | null;
  longitude: number | null;
  /** Hearing radius in nautical miles (1–15). */
  radiusNm: number;
}

const STORAGE_KEY = 'overhead_settings';

export const RADIUS_MIN_NM = 1;
export const RADIUS_MAX_NM = 15;
export const RADIUS_DEFAULT_NM = 5;

const DEFAULTS: Settings = {
  latitude: null,
  longitude: null,
  radiusNm: RADIUS_DEFAULT_NM,
};

export function clampRadius(radius: unknown): number {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) return RADIUS_DEFAULT_NM;
  return Math.min(RADIUS_MAX_NM, Math.max(RADIUS_MIN_NM, radius));
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as Settings;
    // Stored values may predate the catch model (radius default used to be
    // 25 nm) — clamp into the hearing-radius range.
    return { ...parsed, radiusNm: clampRadius(parsed.radiusNm) };
  } catch {
    return DEFAULTS;
  }
}

function persist(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage unavailable
  }
}

export function useSettings(): {
  settings: Settings;
  saveSettings: (s: Settings) => void;
  syncFromServer: (s: Settings) => void;
  hasSettings: boolean;
} {
  const [settings, setSettings] = useState<Settings>(load);

  function saveSettings(s: Settings) {
    const next = { ...s, radiusNm: clampRadius(s.radiusNm) };
    setSettings(next);
    persist(next);
  }

  // Called after a successful server profile fetch — overwrites local state
  // without writing back to the server (avoids a useless round-trip).
  function syncFromServer(s: Settings) {
    const next = { ...s, radiusNm: clampRadius(s.radiusNm) };
    setSettings(next);
    persist(next);
  }

  const hasSettings = settings.latitude !== null && settings.longitude !== null;

  return { settings, saveSettings, syncFromServer, hasSettings };
}
