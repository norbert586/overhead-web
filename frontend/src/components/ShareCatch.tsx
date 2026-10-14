import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Flight } from '../types/flight';
import { catchShareText, type ShareOptions } from '../utils/shareCatch';
import { copyText } from '../utils/clipboard';
import { recordEvent } from '../utils/diagnostics';

function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" className="share-catch-icon" aria-hidden="true">
      <path d="M8 1.5v8.5M4.75 4.5 8 1.5l3.25 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 7H4a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareSheet({ text, onClose }: { text: string; onClose: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const primaryRef = useRef<HTMLButtonElement>(null);
  // Only `text`, no `url`: the link is already in the text, and iOS Copy in
  // the share sheet keeps text over url — passing both lost one or the other.
  const canShare = typeof navigator.share === 'function'
    && (typeof navigator.canShare !== 'function' || navigator.canShare({ text }));

  useEffect(() => {
    primaryRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (copyState !== 'copied') return;
    const t = setTimeout(() => setCopyState('idle'), 2_500);
    return () => clearTimeout(t);
  }, [copyState]);

  async function copy() {
    const ok = await copyText(text);
    recordEvent('share-copy', { ok });
    setCopyState(ok ? 'copied' : 'failed');
  }

  function share() {
    recordEvent('share-sheet');
    navigator.share({ text }).catch((err: unknown) => {
      // Dismissing the sheet rejects with AbortError — that's not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      void copy();
    });
  }

  // Portalled to <body>: an ancestor with a transform or backdrop-filter (the
  // glass cards) becomes the containing block for position: fixed, which
  // would pin the overlay inside that card instead of over the page.
  return createPortal(
    <div className="share-sheet-backdrop" onClick={onClose}>
      <div
        className="share-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="share-sheet-head">
          <span id="share-sheet-title" className="share-sheet-title">Share this catch</span>
          <button type="button" className="share-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="share-bubble-wrap">
          <div className="share-bubble" data-testid="share-text">{text}</div>
        </div>
        <div className="share-sheet-actions">
          {canShare && (
            <button ref={primaryRef} type="button" className="share-sheet-btn primary" onClick={share}>
              <ShareIcon /> Send…
            </button>
          )}
          <button
            ref={canShare ? undefined : primaryRef}
            type="button"
            className={`share-sheet-btn${canShare ? '' : ' primary'}`}
            onClick={copy}
          >
            {copyState === 'copied' ? 'Copied ✓' : 'Copy text'}
          </button>
        </div>
        {copyState === 'failed' && (
          <div className="share-sheet-hint" role="status">
            Couldn’t copy automatically — press and hold the message above to select it.
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

interface ShareCatchButtonProps extends ShareOptions {
  flight: Flight;
  className?: string;
}

/** "Share" button that opens a ready-to-text summary of this aircraft. */
export default function ShareCatchButton({ flight, className, ...options }: ShareCatchButtonProps) {
  // Snapshot on open: the live feed refreshes every 10 s and the message
  // shouldn't change under the user while they're copying it.
  const [text, setText] = useState<string | null>(null);
  // Stable, so the sheet's focus/scroll-lock effect doesn't re-run on every poll.
  const close = useCallback(() => setText(null), []);

  return (
    <>
      <button
        type="button"
        className={`share-catch-btn${className ? ` ${className}` : ''}`}
        onClick={() => setText(catchShareText(flight, options))}
        aria-haspopup="dialog"
        aria-label="Share"
      >
        <ShareIcon />
        <span>Share</span>
      </button>
      {text !== null && <ShareSheet text={text} onClose={close} />}
    </>
  );
}
