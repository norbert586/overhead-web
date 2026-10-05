import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PhotoCandidate } from '../types/photo';
import { framePhoto, NO_INSETS, type Insets } from '../utils/photoLayout';
import { reportBrokenPhoto } from '../utils/photos';

export interface SmartPhotoState {
  /** The candidate being shown (or loading); null once every one has failed. */
  active: PhotoCandidate | null;
  /** The active image has finished loading and is visible. */
  loaded: boolean;
  /** Every candidate failed to load. */
  exhausted: boolean;
}

interface SmartPhotoProps {
  candidates: PhotoCandidate[];
  alt: string;
  /** Space kept clear of the aircraft for overlaid labels, in px. */
  insets?: Insets | ((width: number, height: number) => Insets);
  /** Link the photo to its source page — Planespotters' terms require it. */
  linked?: boolean;
  /** Overlays (credit, labels, placeholder), drawn above the photo. */
  children?: (state: SmartPhotoState) => ReactNode;
}

/**
 * A photo framed around the aircraft (utils/photoLayout.ts) that falls back
 * through its candidates when one won't load, reporting the dead URL.
 */
export default function SmartPhoto({ candidates, alt, insets = NO_INSETS, linked = true, children }: SmartPhotoProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Which candidate, and its real size once loaded. Reset during render when
  // the list changes, so the previous aircraft's photo never flashes.
  const listKey = candidates.map((c) => c.url).join('\n');
  const [state, setState] = useState({ listKey, index: 0, natural: null as { w: number; h: number } | null });
  if (state.listKey !== listKey) setState({ listKey, index: 0, natural: null });
  const index = state.listKey === listKey ? state.index : 0;
  const naturalSize = state.listKey === listKey ? state.natural : null;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const active = candidates[index] ?? null;
  const exhausted = candidates.length > 0 && index >= candidates.length;
  const loaded = !!active && naturalSize !== null;
  // The server usually knows the size, so the frame is right before the image arrives.
  const natural = naturalSize ?? (active?.width && active.height ? { w: active.width, h: active.height } : null);
  const pad = typeof insets === 'function' ? (size ? insets(size.w, size.h) : NO_INSETS) : insets;
  const frame = active && size && natural ? framePhoto(size.w, size.h, natural.w, natural.h, active.focus, pad) : null;

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setState((s) => (s.listKey === listKey ? { ...s, natural: { w: img.naturalWidth, h: img.naturalHeight } } : s));
  }

  function handleError() {
    if (active) reportBrokenPhoto(active.url);
    setState((s) => (s.listKey === listKey ? { ...s, index: s.index + 1, natural: null } : s));
  }

  const style = frame
    ? { left: frame.left, top: frame.top, width: frame.width, height: frame.height }
    : undefined;
  const img = active && (
    <img
      key={active.url}
      className={`smart-photo-img${loaded ? ' loaded' : ''}${frame ? ' framed' : ''}`}
      src={active.url}
      alt={alt}
      decoding="async"
      style={style}
      onLoad={handleLoad}
      onError={handleError}
    />
  );

  return (
    <div
      ref={wrapRef}
      className="smart-photo"
      data-provider={active?.provider}
      data-match={active?.match}
      data-letterboxed={frame?.letterboxed || undefined}
    >
      {active && loaded && frame?.letterboxed && (
        <img className="smart-photo-backdrop" src={active.url} alt="" aria-hidden="true" />
      )}
      {img && linked && active?.link
        ? <a className="smart-photo-link" href={active.link} target="_blank" rel="noopener" title="View on the photographer's page">{img}</a>
        : img}
      {children?.({ active: exhausted ? null : active, loaded, exhausted })}
    </div>
  );
}
