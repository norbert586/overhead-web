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

// `?motion=off` freezes decorative motion (canvas loops and CSS keyframes) so
// e2e screenshots don't depend on which frame they caught. Kept for the tab's
// session so a reload or in-app sign-out doesn't drop it. View Transitions are
// deliberately left on: tests must keep exercising the frame-late DOM update
// real users get.
const FROZEN_KEY = 'overhead_motion_off';

/** Read `?motion=off|on` once at startup and mark <html data-motion="off">. Call before render. */
export function applyMotionOverride(): void {
  try {
    const q = new URLSearchParams(window.location.search).get('motion');
    if (q === 'off') sessionStorage.setItem(FROZEN_KEY, '1');
    if (q === 'on') sessionStorage.removeItem(FROZEN_KEY);
    if (sessionStorage.getItem(FROZEN_KEY)) document.documentElement.dataset.motion = 'off';
  } catch { /* storage blocked: the query alone still works for this load */
    if (window.location.search.includes('motion=off')) document.documentElement.dataset.motion = 'off';
  }
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** False when the user asked for reduced motion or motion is frozen. Ambient effects then draw one still frame. */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.dataset.motion === 'off') return false;
  return !window.matchMedia?.(REDUCED_QUERY).matches;
}

/** Subscribe to changes of motionAllowed() (the OS setting can flip while the app is open). */
export function onMotionPreferenceChange(cb: () => void): () => void {
  const mq = window.matchMedia?.(REDUCED_QUERY);
  mq?.addEventListener?.('change', cb);
  return () => mq?.removeEventListener?.('change', cb);
}
