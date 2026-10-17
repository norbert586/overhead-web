// The one canvas every ambient effect draws into. It owns the plumbing each
// effect would otherwise repeat (and get subtly wrong): sizing to its box,
// capping the pixel ratio, resolving theme colours, and the frame loop with
// all its pause conditions. An effect is just a draw function.
//
// Budget for effects built on this: no animation library, ≤ ~8 KB gzipped
// each, lazy-loaded with React.lazy where they aren't on the first screen,
// and a still frame (motion reduced or frozen) that looks finished on its own.

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useAnimationFrame, type FrameInfo } from '../hooks/useAnimationFrame';
import { onThemeChange, readThemeTokens, type ThemeTokens } from '../utils/themeTokens';

export interface DrawContext extends FrameInfo {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels — the context is already scaled, so draw in these. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel actually in use (after the cap). */
  dpr: number;
  tokens: ThemeTokens;
  /** False for a still frame (motion off): draw something complete, not frame one of an intro. */
  animating: boolean;
}

interface ChartCanvasProps {
  draw: (d: DrawContext) => void;
  /** Token names (without `--`) the effect reads; re-resolved on theme change. */
  tokens?: readonly string[];
  /** Pass false to show the still frame only (e.g. while something else on screen is busy). */
  animate?: boolean;
  fps?: number;
  /** Pixel-ratio cap: 3× phones would quadruple fill cost for detail nobody sees in a background. */
  maxDpr?: number;
  className?: string;
}

const NO_TOKENS: readonly string[] = [];

export default function ChartCanvas({
  draw,
  tokens = NO_TOKENS,
  animate = true,
  fps,
  maxDpr = 2,
  className,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ width: 0, height: 0, dpr: 1 });
  const resolved = useRef<ThemeTokens>({});
  const lastFrame = useRef<FrameInfo>({ t: 0, dt: 0 });
  const tokenKey = tokens.join(',');
  // Bumped whenever the still frame must be redrawn (resize, theme change).
  const [stillVersion, setStillVersion] = useState(0);

  const render = (frame: FrameInfo, animating: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { width, height, dpr } = size.current;
    if (!ctx || !width || !height) return;
    lastFrame.current = frame;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    draw({ ctx, width, height, dpr, tokens: resolved.current, animating, ...frame });
  };

  const live = useAnimationFrame(canvasRef, (frame) => render(frame, true), { fps, enabled: animate });
  const paintNow = useEffectEvent(render);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      size.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Resizing clears the bitmap; redraw now rather than wait for the next tick.
      setStillVersion((v) => v + 1);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [maxDpr]);

  useEffect(() => {
    const names = tokenKey ? tokenKey.split(',') : [];
    const refresh = () => {
      resolved.current = readThemeTokens(names);
      setStillVersion((v) => v + 1);
    };
    refresh();
    return onThemeChange(refresh);
  }, [tokenKey]);

  // Still frame when the loop isn't running, and an immediate repaint after a
  // resize or theme change in either case (a paused loop won't do it).
  useEffect(() => {
    paintNow(live ? lastFrame.current : { t: 0, dt: 0 }, live);
  }, [live, stillVersion]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
