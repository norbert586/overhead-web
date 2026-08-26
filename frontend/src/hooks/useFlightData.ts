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
  const consecutiveErrors = useRef(0);

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

    try {
      const result = await fetchFlights(latitude, longitude, radiusNm, record);
      // Clear the error only on success — clearing it when the poll starts
      // would flicker the UI out of its error state on every retry during
      // an outage.
      setError(null);
      consecutiveErrors.current = 0;
      setData(result);
      setLastPollTime(new Date());
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Unknown error');
        // One failed poll can be a blip — keep showing what we had. A second
        // in a row means the feed is really down, so stop presenting stale
        // aircraft as live and let the UI show the outage instead.
        consecutiveErrors.current += 1;
        if (consecutiveErrors.current >= 2) setData(null);
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
