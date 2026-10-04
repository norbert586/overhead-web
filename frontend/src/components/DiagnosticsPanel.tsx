import { useCallback, useEffect, useState } from 'react';
import { buildReport, reportToServer, type DiagnosticReport } from '../utils/diagnostics';

interface Props {
  onClose: () => void;
}

function ago(iso: unknown): string {
  if (typeof iso !== 'string') return '—';
  const sec = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(sec)) return '—';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

function until(iso: unknown): string {
  if (typeof iso !== 'string') return '—';
  const days = (Date.parse(iso) - Date.now()) / 86_400_000;
  if (days < 0) return 'expired';
  return days >= 1 ? `${Math.floor(days)}d left` : `${Math.round(days * 24)}h left`;
}

type Tone = 'ok' | 'warn' | 'bad' | 'muted';

function Row({ label, value, tone = 'muted' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="diag-row">
      <span className="diag-row-label">{label}</span>
      <span className={`diag-row-value diag-tone-${tone}`}>{value}</span>
    </div>
  );
}

/**
 * Everything needed to debug "it's not working" from a phone, on one
 * screen — and a one-tap copy of it as JSON to paste into a bug report or
 * a Claude Code session.
 */
export default function DiagnosticsPanel({ onClose }: Props) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [sent, setSent] = useState(false);

  const refresh = useCallback(() => {
    buildReport().then(setReport);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const json = report ? JSON.stringify(report, null, 2) : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopyState('copied');
    } catch {
      // Clipboard needs a secure context + permission; the textarea below
      // is the fallback (long-press → Select all → Copy).
      setCopyState('failed');
    }
  }

  function send() {
    if (!report) return;
    reportToServer('user-report', 'Diagnostics report sent from the app', {
      detail: { ...report, events: report.events.slice(0, 15) },
    }, true);
    setSent(true);
  }

  const server = report?.server as Record<string, unknown> | undefined;
  const serverError = server && 'error' in server ? String(server.error) : null;
  const serverVersion = (server?.version as { commit?: string } | undefined)?.commit;
  const problems = (server?.problems as string[] | undefined) ?? [];
  const warnings = (server?.warnings as string[] | undefined) ?? [];
  const providers = ((server?.adsb as { providers?: Array<Record<string, unknown>> } | undefined)?.providers) ?? [];
  const lastPoll = report?.state.lastPoll as Record<string, unknown> | undefined;
  const geo = report?.state.geo as Record<string, unknown> | undefined;
  const session = report?.session;

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal diag-panel" role="dialog" aria-label="Diagnostics" onClick={(e) => e.stopPropagation()}>
        <div className="diag-header">
          <h3 className="admin-modal-title">Diagnostics</h3>
          <button type="button" className="admin-row-action" onClick={onClose}>Close</button>
        </div>

        {!report ? (
          <div className="admin-loading">Collecting…</div>
        ) : (
          <>
            <div className="diag-section">
              <Row label="App build" value={`${report.app.version} · ${ago(report.app.builtAt)}`} />
              <Row
                label="Server build"
                value={serverError ? `unreachable — ${serverError}` : `${serverVersion ?? '?'}${report.versionMismatch ? ' · differs from app — reload' : ''}`}
                tone={serverError ? 'bad' : report.versionMismatch ? 'warn' : 'ok'}
              />
              {!serverError && (
                <Row
                  label="Server status"
                  value={problems.length ? problems.join('; ')
                    : warnings.length ? `ok · ${warnings.join('; ')}`
                    : String(server?.status ?? '?')}
                  tone={problems.length ? 'bad' : warnings.length ? 'warn' : 'ok'}
                />
              )}
              {providers.map((p) => (
                <Row
                  key={String(p.name)}
                  label={`Feed · ${String(p.name)}`}
                  value={p.lastError && (!p.lastSuccessAt || String(p.lastErrorAt) > String(p.lastSuccessAt))
                    ? `failing ${ago(p.lastErrorAt)} — ${String(p.lastError).slice(0, 80)}`
                    : p.lastSuccessAt ? `ok ${ago(p.lastSuccessAt)} · ${String(p.lastLatencyMs ?? '?')} ms` : 'not used yet'}
                  tone={p.lastError && (!p.lastSuccessAt || String(p.lastErrorAt) > String(p.lastSuccessAt)) ? 'bad' : p.lastSuccessAt ? 'ok' : 'muted'}
                />
              ))}
            </div>

            <div className="diag-section">
              <Row label="Connection" value={report.page.online ? 'online' : 'offline'} tone={report.page.online ? 'ok' : 'bad'} />
              <Row
                label="Session"
                value={!session?.signedIn ? 'signed out (guest)'
                  : session.expired ? 'expired — sign in again'
                  : `valid · ${until(session.expiresAt)}`}
                tone={session?.expired ? 'bad' : 'ok'}
              />
              <Row
                label="Location"
                value={!geo ? 'no fix yet'
                  : geo.status === 'ready' ? `${String(geo.source)} fix ±${String(geo.accuracyM)} m · ${ago(geo.fixAt)}`
                  : `${String(geo.status)}${geo.message ? ` — ${String(geo.message)}` : ''}`}
                tone={!geo ? 'muted' : geo.status === 'ready' ? 'ok' : 'bad'}
              />
              <Row
                label="Last poll"
                value={!lastPoll ? 'none yet'
                  : lastPoll.ok
                    ? `ok ${ago(lastPoll.at)} · ${String(lastPoll.ms)} ms · ${String(lastPoll.flights)} shown${lastPoll.serverStale ? ' · stale snapshot' : ''}`
                    : `${String(lastPoll.kind)} ${ago(lastPoll.at)} · ${String(lastPoll.message)}${lastPoll.requestId ? ` · ref ${String(lastPoll.requestId)}` : ''}`}
                tone={!lastPoll ? 'muted' : lastPoll.ok ? 'ok' : 'bad'}
              />
            </div>

            <div className="diag-section">
              <div className="diag-section-title">Recent events</div>
              {report.events.length === 0 ? (
                <div className="diag-event diag-tone-muted">None</div>
              ) : report.events.slice(0, 12).map((e, i) => (
                <div key={i} className="diag-event">
                  <span className="diag-event-time">{ago(e.at)}</span>
                  <span>{e.type}{e.detail ? ` ${JSON.stringify(e.detail)}` : ''}</span>
                </div>
              ))}
            </div>

            <div className="diag-actions">
              <button type="button" className="admin-row-action" onClick={copy}>
                {copyState === 'copied' ? 'Copied' : 'Copy report'}
              </button>
              <button type="button" className="admin-row-action" onClick={send} disabled={sent}>
                {sent ? 'Sent' : 'Send to server'}
              </button>
              <button type="button" className="admin-row-action" onClick={refresh}>Refresh</button>
              <button type="button" className="admin-row-action" onClick={() => window.location.reload()}>Reload app</button>
            </div>
            {copyState === 'failed' && (
              <textarea className="diag-json" readOnly value={json} onFocus={(e) => e.currentTarget.select()} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
