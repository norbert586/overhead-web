import { useEffect, useEffectEvent, type RefObject } from 'react';
import { useMotionAllowed } from './useMotionAllowed';
import { usePageVisibility } from './usePageVisibility';

export interface FrameInfo {
  /** Seconds the loop has been running (excludes paused time, so effects resume where they stopped). */
  t: number;
  /** Seconds since the previous frame, clamped so a long pause doesn't make things jump. */
  dt: number;
}

interface Options {
  /** Frame-rate cap. Ambient effects don't need 60/120 Hz, and the app is used outdoors on battery. */
  fps?: number;
  /** Extra caller condition (e.g. only while the screen is idle). */
  enabled?: boolean;
}

/**
 * A requestAnimationFrame loop for ambient effects that only runs when it can
 * be seen: paused while the tab is hidden, while `ref` is scrolled offscreen
 * or under a closed screen, and entirely when motion is reduced or frozen.
 * Returns whether the loop is live, so the caller can draw a still frame
 * instead when it isn't.
 */
export function useAnimationFrame(
  ref: RefObject<Element | null>,
  onFrame: (frame: FrameInfo) => void,
  { fps = 30, enabled = true }: Options = {},
): boolean {
  const motion = useMotionAllowed();
  const visible = usePageVisibility();
  const live = motion && visible && enabled;
  const frame = useEffectEvent(onFrame);

  useEffect(() => {
    const el = ref.current;
    if (!live || !el) return;
    const minGap = 1000 / fps;
    let raf = 0;
    let onscreen = true;
    let last = 0;
    let t = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Allow a little slack so a 60 Hz display reliably lands on every other frame at 30 fps.
      if (last && now - last < minGap - 2) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      t += dt;
      frame({ t, dt });
    };
    const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    const io = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      if (onscreen) start(); else stop();
    });
    io.observe(el);
    if (onscreen) start();
    return () => { io.disconnect(); stop(); };
  }, [ref, live, fps]);

  return live;
}
