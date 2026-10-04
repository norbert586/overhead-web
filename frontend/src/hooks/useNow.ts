import { useEffect, useState } from 'react';

/**
 * Wall-clock time that re-renders every `intervalMs` while `active`. For
 * countdowns and "Ns ago" labels; idle when nothing on screen needs it.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Catch up right away — `now` may date from long before activation.
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, intervalMs]);
  return now;
}
