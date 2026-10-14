import { useEffect, useRef, useState } from 'react';

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that glides to each new value instead of jumping — the altimeter
 * winding as a plane climbs between polls. Snaps when the subject changes
 * (`key`), when motion is reduced, or for the first value.
 */
export function useTween(value: number | null, key: string, durationMs = 900): number | null {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const lastKey = useRef(key);
  const raf = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const start = from.current;
    if (value === null || start === null || lastKey.current !== key || reducedMotion() || start === value) {
      lastKey.current = key;
      from.current = value;
      raf.current = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(raf.current);
    }
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      const v = start + (value - start) * eased;
      from.current = v;
      setShown(v);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, key, durationMs]);

  return shown;
}
