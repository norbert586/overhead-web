// Client-side diagnostics.
//
// Three jobs:
//  1. Keep a small ring of notable events (failed polls, GPS errors, crashes)
//     and the latest state of each subsystem, for the diagnostics panel.
//  2. Report errors to the server (/api/diagnostics/client-report) so the
//     admin System tab shows what users actually saw — throttled per kind.
//  3. Build a copyable JSON report: everything someone debugging needs, in
//     one paste.
//
// Imports nothing from services/api.ts (which imports this) to stay acyclic.

/** The release people see, e.g. "2.5.0" — bumped on every merge. */
export const APP_VERSION: string = __APP_VERSION__;
/** The exact build; compared with the server's to spot a stale cached app. */
export const APP_COMMIT: string = __APP_COMMIT__;
/** Release + build in one string, for reports: "2.5.0+9aed1ee". */
export const APP_BUILD = `${APP_VERSION}+${APP_COMMIT}`;
export const APP_BUILT_AT: string = __APP_BUILT_AT__;

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

/** Fired on window to open the diagnostics panel from anywhere. */
export const OPEN_DIAGNOSTICS_EVENT = 'overhead:open-diagnostics';

export function openDiagnostics(): void {
  window.dispatchEvent(new Event(OPEN_DIAGNOSTICS_EVENT));
}

// ── Event ring ──────────────────────────────────────────────────────────────

export interface ClientEvent {
  at: string;
  type: string;
  detail?: Record<string, unknown>;
}

const EVENT_RING_SIZE = 60;
const events: ClientEvent[] = [];

export function recordEvent(type: string, detail?: Record<string, unknown>): void {
  events.push({ at: new Date().toISOString(), type, ...(detail && { detail }) });
  if (events.length > EVENT_RING_SIZE) events.shift();
}

export function getEvents(): ClientEvent[] {
  return [...events].reverse();
}

// ── Latest subsystem state (last poll, location, …) ─────────────────────────

const state: Record<string, unknown> = {};

export function setDiagState(key: string, value: unknown): void {
  state[key] = value;
}

export function getDiagState(): Record<string, unknown> {
  return { ...state };
}

// ── Server reports ──────────────────────────────────────────────────────────

const REPORT_GAP_MS = 60_000;
const lastReported = new Map<string, number>();

/**
 * Tell the server about an error this client hit. At most one report per
 * kind per minute (a dead feed fails every poll). Never throws, never
 * awaits — diagnostics must not make anything slower or more fragile.
 */
export function reportToServer(
  kind: string,
  message: string,
  extra: { requestId?: string | null; detail?: unknown } = {},
  force = false,
): void {
  const now = Date.now();
  if (!force && now - (lastReported.get(kind) ?? 0) < REPORT_GAP_MS) return;
  lastReported.set(kind, now);
  try {
    const token = localStorage.getItem('overhead_token');
    void fetch(`${BASE_URL}/api/diagnostics/client-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        kind,
        message,
        appVersion: APP_BUILD,
        requestId: extra.requestId ?? null,
        detail: extra.detail ?? null,
      }),
      keepalive: true, // survives the reload that follows a chunk-load error
    }).catch(() => {});
  } catch {
    // Storage or fetch unavailable — nothing useful to do.
  }
}

/** Report uncaught errors and connectivity changes. Call once at startup. */
export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (e) => {
    const source = e.filename ? `${e.filename.split('/').pop()}:${e.lineno}:${e.colno}` : null;
    recordEvent('js-error', { message: e.message, source });
    reportToServer('js-error', e.message, { detail: { source } });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const message = e.reason instanceof Error ? e.reason.message : String(e.reason);
    recordEvent('unhandled-rejection', { message });
    reportToServer('unhandled-rejection', message);
  });
  window.addEventListener('online', () => recordEvent('online'));
  window.addEventListener('offline', () => recordEvent('offline'));
  document.addEventListener('visibilitychange', () => recordEvent(`page-${document.visibilityState}`));
  recordEvent('app-start', { version: APP_BUILD });
}

// ── Report ──────────────────────────────────────────────────────────────────

function sessionInfo() {
  try {
    const token = localStorage.getItem('overhead_token');
    const user = JSON.parse(localStorage.getItem('overhead_user') ?? 'null') as { id?: number } | null;
    if (!token) return { signedIn: !!user, token: 'none', userId: user?.id ?? null };
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as
      { iat?: number; exp?: number };
    return {
      signedIn: !!user,
      userId: user?.id ?? null,
      // Claims only — never the token itself.
      issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      expired: payload.exp ? payload.exp * 1000 < Date.now() : null,
    };
  } catch {
    return { signedIn: null, token: 'unreadable' };
  }
}

export interface DiagnosticReport {
  generatedAt: string;
  app: { version: string; commit: string; builtAt: string };
  server: Record<string, unknown> | { error: string };
  versionMismatch: boolean | null;
  page: Record<string, unknown>;
  session: Record<string, unknown>;
  state: Record<string, unknown>;
  events: ClientEvent[];
}

/** Everything someone debugging needs, as one JSON object. */
export async function buildReport(): Promise<DiagnosticReport> {
  let server: DiagnosticReport['server'];
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    server = res.ok
      ? await res.json() as Record<string, unknown>
      : { error: `HTTP ${res.status} ${res.statusText}` };
  } catch (err) {
    server = { error: err instanceof Error ? err.message : String(err) };
  }
  const serverCommit = (server as { version?: { commit?: string } }).version?.commit;
  return {
    generatedAt: new Date().toISOString(),
    app: { version: APP_VERSION, commit: APP_COMMIT, builtAt: APP_BUILT_AT },
    server,
    versionMismatch: serverCommit && APP_COMMIT !== 'dev' ? serverCommit !== APP_COMMIT : null,
    page: {
      path: location.pathname,
      online: navigator.onLine,
      visibility: document.visibilityState,
      installedApp: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
      serviceWorker: 'serviceWorker' in navigator ? !!navigator.serviceWorker.controller : 'unsupported',
      viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
      userAgent: navigator.userAgent,
    },
    session: sessionInfo(),
    state: getDiagState(),
    events: getEvents(),
  };
}
