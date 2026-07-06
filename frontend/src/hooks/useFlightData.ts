import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchFlights } from '../services/api';
import type { FlightsResponse } from '../types/flight';

interface UseFlightDataParams {
  latitude: number | null;
  longitude: number | null;
  radiusNm: number;
  pollIntervalSec: number;
  enabled?: boolean;
  record?: boolean;
}

export function useFlightData(params: UseFlightDataParams): {
  data: FlightsResponse | null;
  loading: boolean;
  error: string | null;
  lastPollTime: Date | null;
} {
  const [data, setData] = useState<FlightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the latest params in a ref so `poll` stays stable across GPS updates.
  // watchPosition fires often; recreating the interval on every fix would
  // cancel in-flight fetches and leave the UI stuck in a loading state.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const poll = useCallback(async () => {
    const { latitude, longitude, radiusNm, enabled = true, record = true } = paramsRef.current;
    if (!enabled || latitude === null || longitude === null) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFlights(latitude, longitude, radiusNm, record);
      setData(result);
      setLastPollTime(new Date());
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // One effect drives everything: it waits for coordinates, polls immediately
  // when they arrive, then keeps the interval. GPS jitter changes lat/lon on
  // every fix but hasCoords only flips null → present, so the interval isn't
  // restarted (and no duplicate request fired) on ordinary position updates.
  const { enabled = true, pollIntervalSec } = params;
  const hasCoords = params.latitude !== null && params.longitude !== null;
  useEffect(() => {
    if (!enabled || !hasCoords) return;
    poll();
    const id = setInterval(poll, pollIntervalSec * 1000);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [poll, enabled, pollIntervalSec, hasCoords]);

  return { data, loading, error, lastPollTime };
}
