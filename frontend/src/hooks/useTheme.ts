import { useCallback, useEffect, useState } from 'react';
import { isDarkOutside } from '../utils/sky';

/**
 * device — follow the phone's light/dark setting (default)
 * sun    — dark from just after sunset at the catch point, light from sunrise
 * light / dark — fixed
 */
export type ThemePreference = 'device' | 'sun' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

// index.html reads these two keys before first paint, so a night launch
// never flashes the day chart. Keep the names in sync with it.
const PREF_KEY = 'overhead_theme';
const SUN_KEY = 'overhead_theme_sun';

// Matches --bg-primary per theme: the browser chrome / status bar colour.
const CHROME_COLOR: Record<ResolvedTheme, string> = { light: '#ECEEE6', dark: '#0F192C' };

function readPref(): ThemePreference {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'sun' || v === 'light' || v === 'dark' ? v : 'device';
  } catch {
    return 'device';
  }
}

const deviceDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function resolve(pref: ThemePreference, lat: number | null, lon: number | null): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  if (pref === 'sun') {
    if (lat !== null && lon !== null) return isDarkOutside(new Date(), lat, lon) ? 'dark' : 'light';
    try {
      const cached = localStorage.getItem(SUN_KEY);
      if (cached === 'dark' || cached === 'light') return cached;
    } catch { /* fall through */ }
  }
  return deviceDark() ? 'dark' : 'light';
}

function apply(theme: ResolvedTheme) {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME_COLOR[theme]);
}

/** Read and change the theme preference. Any number of screens can use this. */
export function useThemePreference() {
  const [pref, setPrefState] = useState<ThemePreference>(readPref);

  useEffect(() => {
    const onPref = () => setPrefState(readPref());
    window.addEventListener('overhead-theme', onPref);
    window.addEventListener('storage', onPref);
    return () => {
      window.removeEventListener('overhead-theme', onPref);
      window.removeEventListener('storage', onPref);
    };
  }, []);

  const setPref = useCallback((next: ThemePreference) => {
    try { localStorage.setItem(PREF_KEY, next); } catch { /* session only */ }
    setPrefState(next);
    window.dispatchEvent(new Event('overhead-theme'));
  }, []);

  return { pref, setPref };
}

/**
 * Keeps <html data-theme> in step with the preference, the device setting and
 * — in "sun" mode — the sun at the catch point (re-checked every minute).
 * Mount once, at the app root.
 */
export function useTheme(lat: number | null = null, lon: number | null = null): ResolvedTheme {
  const { pref } = useThemePreference();
  const [, setTick] = useState(0);
  const resolved = resolve(pref, lat, lon);

  useEffect(() => {
    apply(resolved);
    if (pref === 'sun' && lat !== null) {
      try { localStorage.setItem(SUN_KEY, resolved); } catch { /* not persisted */ }
    }
  }, [resolved, pref, lat]);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const bump = () => setTick((t) => t + 1);
    mq?.addEventListener?.('change', bump);
    const id = pref === 'sun' ? window.setInterval(bump, 60_000) : undefined;
    return () => {
      mq?.removeEventListener?.('change', bump);
      if (id) window.clearInterval(id);
    };
  }, [pref]);

  return resolved;
}
