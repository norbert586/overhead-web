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

function isGeoSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

export function useGeolocation({ enabled = true }: UseGeolocationOptions = {}): GeoState {
  const supported = isGeoSupported();
  const [latitude, setLatitude]   = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [status, setStatus]       = useState<GeoStatus>(() => supported ? 'idle' : 'unsupported');
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
