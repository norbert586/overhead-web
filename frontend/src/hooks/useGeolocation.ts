import { useEffect, useState, useCallback, useRef } from 'react';
import { recordEvent, setDiagState } from '../utils/diagnostics';

export type GeoStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'unsupported' | 'error';

export interface GeoState {
  latitude: number | null;
  longitude: number | null;
  status: GeoStatus;
  error: string | null;
  retry: () => void;
}

interface UseGeolocationOptions {
  enabled?: boolean;
}

const CACHE_KEY = 'overhead-web:lastGeoFix';
const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

interface CachedFix {
  latitude: number;
  longitude: number;
  timestamp: number;
}

// localStorage, not sessionStorage: a home-screen app starts a fresh session
// on every launch, which threw the cache away exactly when it mattered.
function readCachedFix(): CachedFix | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFix;
    if (
      typeof parsed.latitude !== 'number' ||
      typeof parsed.longitude !== 'number' ||
      typeof parsed.timestamp !== 'number'
    ) return null;
    if (Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedFix(latitude: number, longitude: number) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ latitude, longitude, timestamp: Date.now() }),
    );
  } catch {
    // Storage may be unavailable (private mode, etc.) — ignore.
  }
}

function isGeoSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

export function useGeolocation({ enabled = true }: UseGeolocationOptions = {}): GeoState {
  const supported = isGeoSupported();
  const cached = supported ? readCachedFix() : null;

  const [latitude, setLatitude]   = useState<number | null>(cached?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(cached?.longitude ?? null);
  // If we have a cached fix we treat ourselves as 'ready' immediately so the
  // overhead tab can show its last-known data without a "Locating you..."
  // flash on every re-entry. The watchPosition below will refine the fix.
  const [status, setStatus]       = useState<GeoStatus>(() => {
    if (!supported) return 'unsupported';
    return cached ? 'ready' : 'idle';
  });
  const [error, setError]         = useState<string | null>(() =>
    supported ? null : 'Geolocation is not available in this browser.',
  );
  const [tick, setTick]           = useState(0);
  // Whether this watch has produced a fix. Once it has, transient errors
  // (TIMEOUT while stationary, a brief POSITION_UNAVAILABLE indoors) keep the
  // last fix instead of declaring location unavailable.
  const haveFix = useRef(cached !== null);
  const havePreciseFix = useRef(false);

  const retry = useCallback(() => {
    if (!supported) return;
    setStatus('idle');
    setError(null);
    setTick((n) => n + 1);
  }, [supported]);

  useEffect(() => {
    if (!enabled || !supported) return;

    const apply = (pos: GeolocationPosition, source: 'coarse' | 'precise') => {
      // Rounded to ~1 km: enough to debug "wrong place", not a home address.
      setDiagState('geo', {
        status: 'ready', source,
        accuracyM: Math.round(pos.coords.accuracy),
        fixAt: new Date(pos.timestamp).toISOString(),
        approx: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
      });
      if (!haveFix.current) recordEvent('geo-first-fix', { source, accuracyM: Math.round(pos.coords.accuracy) });
      haveFix.current = true;
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
      setStatus('ready');
      setError(null);
      writeCachedFix(pos.coords.latitude, pos.coords.longitude);
    };

    const onError = (err: GeolocationPositionError) => {
      recordEvent('geo-error', { code: err.code, message: err.message, hadFix: haveFix.current });
      if (err.code === err.PERMISSION_DENIED) {
        setDiagState('geo', { status: 'denied' });
        haveFix.current = false;
        setStatus('denied');
        setError('Location permission denied.');
        return;
      }
      // Previously any timeout flipped status to 'error' — which switched a
      // signed-in user's catch point to their saved home location and
      // stopped the guest feed altogether, all over a GPS hiccup.
      if (haveFix.current) return;
      setDiagState('geo', { status: 'error', code: err.code, message: err.message });
      setStatus('error');
      setError(err.message || 'Unable to determine location.');
    };

    // Fast first fix: Wi-Fi / cell positioning answers in well under a
    // second, against several for a cold GPS lock, and is plenty for a
    // multi-mile hearing radius. The precise watch below refines it.
    if (!havePreciseFix.current) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { if (!havePreciseFix.current) apply(pos, 'coarse'); },
        onError,
        { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
      );
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        havePreciseFix.current = true;
        apply(pos, 'precise');
      },
      onError,
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 20_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, supported, tick]);

  return { latitude, longitude, status, error, retry };
}
