// Recovering from a deploy that happened while the app was open.
//
// Each build gives the lazily-loaded screens (Log, Stats, Hangar…) new file
// names. A tab or home-screen app still running the previous build then asks
// for a chunk that no longer exists, and the screen fails to load. A reload
// picks up the new build. The guard stops a genuinely broken build from
// reloading in a loop.

import { recordEvent, reportToServer } from './diagnostics';

const RELOAD_KEY = 'overhead:version-reload-at';
const MIN_RELOAD_GAP_MS = 60_000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i
    .test(msg);
}

/** Reload to pick up a new deploy. Returns false (and does nothing) if we just did. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < MIN_RELOAD_GAP_MS) {
      recordEvent('chunk-load-failed-after-reload');
      reportToServer('chunk-load-loop', 'Chunk failed to load right after a version reload');
      return false;
    }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage unavailable — still worth one reload.
  }
  reportToServer('chunk-reload', 'Reloading onto a new build after a chunk failed to load');
  window.location.reload();
  return true;
}
