import { useState } from 'react';

export interface Settings {
  latitude: number | null;
  longitude: number | null;
  radiusNm: number;
  pollIntervalSec: number;
}

const STORAGE_KEY = 'overhead_settings';

const DEFAULTS: Settings = {
  latitude: null,
  longitude: null,
  radiusNm: 25,
  pollIntervalSec: 12,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
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
    setSettings(s);
    persist(s);
  }

  // Called after a successful server profile fetch — overwrites local state
  // without writing back to the server (avoids a useless round-trip).
  function syncFromServer(s: Settings) {
    setSettings(s);
    persist(s);
  }

  const hasSettings = settings.latitude !== null && settings.longitude !== null;

  return { settings, saveSettings, syncFromServer, hasSettings };
}
