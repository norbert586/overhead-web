import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchFlights } from '../services/api';
import type { FlightsResponse } from '../types/flight';

interface UseFlightDataParams {
  latitude: number | null;
  longitude: number | null;
  radiusNm: number;
  pollIntervalSec: number;
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

  const poll = useCallback(async () => {
    const { latitude, longitude, radiusNm } = params;
    if (latitude === null || longitude === null) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await fetchFlights(latitude, longitude, radiusNm);
      setData(result);
      setLastPollTime(new Date());
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  }, [params.latitude, params.longitude, params.radiusNm]); // eslint-disable-line

  useEffect(() => {
    poll();
    const id = setInterval(poll, params.pollIntervalSec * 1000);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [poll, params.pollIntervalSec]);

  return { data, loading, error, lastPollTime };
}
