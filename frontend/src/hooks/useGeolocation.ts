import { useEffect, useState, useCallback } from 'react';

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

function readCachedFix(): CachedFix | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
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
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ latitude, longitude, timestamp: Date.now() }),
    );
  } catch {
    // sessionStorage may be unavailable (private mode, etc.) — ignore.
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

  const retry = useCallback(() => {
    if (!supported) return;
    setStatus('idle');
    setError(null);
    setTick((n) => n + 1);
  }, [supported]);

  useEffect(() => {
    if (!enabled || !supported) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setStatus('ready');
        setError(null);
        writeCachedFix(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Location permission denied.');
        } else {
          setStatus('error');
          setError(err.message || 'Unable to determine location.');
        }
      },
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
