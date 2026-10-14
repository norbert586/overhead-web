import { flushSync } from 'react-dom';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Run a state change inside a View Transition when the browser has them, so
 * the old and new screens cross-fade (and shared elements — the photo, the
 * callsign — morph) instead of cutting. A plain update everywhere else.
 */
export function withViewTransition(update: () => void, kind?: string): void {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> };
  };
  if (!doc.startViewTransition || reduced()) {
    update();
    return;
  }
  const root = document.documentElement;
  if (kind) root.dataset.transition = kind;
  const t = doc.startViewTransition(() => flushSync(update));
  t.finished.finally(() => { if (root.dataset.transition === kind) delete root.dataset.transition; });
}
