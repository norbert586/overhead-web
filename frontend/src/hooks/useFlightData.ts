import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchFlights, ApiError, type ApiErrorKind } from '../services/api';
import { recordEvent, reportToServer, setDiagState } from '../utils/diagnostics';
import type { FlightsResponse } from '../types/flight';

interface UseFlightDataParams {
  latitude: number | null;
  longitude: number | null;
  radiusNm: number;
  pollIntervalSec: number;
  enabled?: boolean;
  record?: boolean;
}

export interface FlightFeed {
  data: FlightsResponse | null;
  loading: boolean;
  error: string | null;
  errorKind: ApiErrorKind | null;
  /** X-Request-Id of the last failed poll, for "ref …" on error screens. */
  errorRequestId: string | null;
  /** `data` is older than the latest poll — the feed is failing, or the server served a stale snapshot. */
  stale: boolean;
  lastPollTime: Date | null;
  /** Epoch ms of the next automatic attempt while failing; null when healthy. */
  nextRetryAt: number | null;
  /** Skip the backoff and poll immediately. */
  retryNow: () => void;
}

// A poll that hasn't answered in this long is abandoned and retried. The
// server bounds its own upstream work to a few seconds, so this only trips
// on a stalled mobile connection.
const REQUEST_TIMEOUT_MS = 15_000;

// Last good data stays on screen, marked delayed, for this long after the
// feed starts failing. An airliner covers ~1 nm every 8 s, so past this the
// positions mislead more than they help.
const STALE_DATA_MAX_MS = 45_000;

// Retry schedule after consecutive failures: a quick first retry (most
// mobile failures are blips), then back off so an outage isn't met with a
// retry storm from every open phone.
const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

function jitter(ms: number): number {
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}

export function useFlightData(params: UseFlightDataParams): FlightFeed {
  const [data, setData] = useState<FlightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ApiErrorKind | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const lastSuccessAt = useRef(0);

  // Keep the latest params in a ref so `poll` stays stable across GPS updates.
  // watchPosition fires often; restarting the loop on every fix would cancel
  // in-flight fetches and leave the UI stuck in a loading state.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const clearTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  // One poll at a time, each scheduling the next when it finishes. A fixed
  // setInterval kept firing while a slow request was still out, so requests
  // piled up — exactly when the backend was struggling.
  const poll = useCallback(async () => {
    const { latitude, longitude, radiusNm, enabled = true, record = true } = paramsRef.current;
    if (!enabled || latitude === null || longitude === null) return;

    clearTimer();
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, REQUEST_TIMEOUT_MS);

    // Coming back to the tab after a while: what's on screen is old news.
    if (lastSuccessAt.current && Date.now() - lastSuccessAt.current > STALE_DATA_MAX_MS) {
      setStale(true);
    }
    setLoading(true);
    const startedAt = performance.now();

    try {
      const result = await fetchFlights(latitude, longitude, radiusNm, record, ctrl.signal);
      const ms = Math.round(performance.now() - startedAt);
      if (failures.current > 0) recordEvent('poll-recovered', { afterFailures: failures.current, ms });
      setDiagState('lastPoll', {
        at: new Date().toISOString(), ok: true, ms, record,
        flights: result.flights.length, active: result.stats?.activeCount ?? null,
        matchedRadiusNm: result.matchedRadiusNm ?? null, serverStale: !!result.stale,
      });
      failures.current = 0;
      // A server-side stale snapshot is only as fresh as its data, so the
      // 45 s budget for keeping it on screen counts from then, not now.
      lastSuccessAt.current = Date.now() - (result.dataAgeSec ?? 0) * 1000;
      setError(null);
      setErrorKind(null);
      setErrorRequestId(null);
      setNextRetryAt(null);
      setStale(!!result.stale);
      setData(result);
      setLastPollTime(new Date());
      timerRef.current = setTimeout(() => void poll(), paramsRef.current.pollIntervalSec * 1000);
    } catch (err) {
      // Superseded by a newer poll, or the loop was stopped — not a failure.
      if (abortRef.current !== ctrl || (ctrl.signal.aborted && !timedOut)) return;

      const kind: ApiErrorKind = timedOut ? 'timeout' : err instanceof ApiError ? err.kind : 'server';
      const message = timedOut ? 'Request timed out' : err instanceof Error ? err.message : 'Unknown error';
      const requestId = err instanceof ApiError ? err.requestId : null;
      const status = err instanceof ApiError ? err.status : null;
      const ms = Math.round(performance.now() - startedAt);
      failures.current += 1;
      setError(message);
      setErrorKind(kind);
      setErrorRequestId(requestId);
      const failure = { kind, status, message, requestId, ms, consecutive: failures.current };
      setDiagState('lastPoll', { at: new Date().toISOString(), ok: false, record, ...failure });
      recordEvent('poll-failed', failure);
      reportToServer(`poll-${kind}`, message, { requestId, detail: failure });

      // Keep showing the last good data (marked delayed) through a blip;
      // drop it once it's too old to describe the sky right now.
      if (Date.now() - lastSuccessAt.current > STALE_DATA_MAX_MS) setData(null);
      else setStale(true);

      // A rejected session won't fix itself — the app signs out on 401.
      if (kind === 'auth') {
        setNextRetryAt(null);
        return;
      }

      const backoff = BACKOFF_MS[Math.min(failures.current - 1, BACKOFF_MS.length - 1)];
      const retryAfterMs = err instanceof ApiError && err.retryAfterSec ? err.retryAfterSec * 1000 : 0;
      const delay = jitter(Math.max(backoff, retryAfterMs));
      setNextRetryAt(Date.now() + delay);
      timerRef.current = setTimeout(() => void poll(), delay);
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === ctrl) setLoading(false);
    }
  }, []);

  const retryNow = useCallback(() => {
    void poll();
  }, [poll]);

  // Starts the loop once coordinates exist and stops it when disabled (page
  // hidden, signed out). GPS jitter changes lat/lon on every fix but
  // hasCoords only flips null → present, so ordinary position updates don't
  // restart the loop; the next poll simply reads the newest position.
  const { enabled = true } = params;
  const hasCoords = params.latitude !== null && params.longitude !== null;
  useEffect(() => {
    if (!enabled || !hasCoords) return;
    void poll();
    // Back online after a dead zone: don't wait out the backoff.
    const onOnline = () => void poll();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      clearTimer();
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [poll, enabled, hasCoords]);

  return { data, loading, error, errorKind, errorRequestId, stale, lastPollTime, nextRetryAt, retryNow };
}
