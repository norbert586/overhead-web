import { useCallback, useEffect, useState } from 'react';
import {
  fetchDiagnostics,
  fetchDiagnosticsProbe,
  fetchHealth,
  type DiagnosticsSnapshot,
  type HealthSnapshot,
  type ProbeSnapshot,
} from '../services/api';
import { APP_VERSION, APP_COMMIT } from '../utils/diagnostics';

function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const sec = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

function duration(sec: number): string {
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

function mb(bytes: number | null): string {
  return bytes === null ? '—' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CountList({ counts, empty = 'none' }: { counts: Record<string, number>; empty?: string }) {
  const entries = Object.entries(counts);
  if (!entries.length) return <span className="diag-tone-muted">{empty}</span>;
  return (
    <span className="diag-kv">
      {entries.slice(0, 12).map(([k, v]) => (
        <span key={k}><b>{k}</b>{v}</span>
      ))}
    </span>
  );
}

const BAD_POLL_OUTCOMES = new Set(['upstream_unavailable', 'server_error', 'auth_expired', 'auth_invalid', 'rate_limited']);

/**
 * Admin → System. The server's own view of what's going wrong: is the feed
 * reachable, what did recent polls get, what errors did clients report.
 * Answers in one screen what used to take SSH and log grepping.
 */
export default function SystemPanel() {
  const [diag, setDiag] = useState<DiagnosticsSnapshot | null>(null);
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [probe, setProbe] = useState<ProbeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    Promise.all([fetchDiagnostics(), fetchHealth()])
      .then(([d, h]) => { setDiag(d); setHealth(h); setError(null); })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  async function runProbe() {
    setProbing(true);
    try {
      setProbe(await fetchDiagnosticsProbe());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Probe failed');
    } finally {
      setProbing(false);
    }
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ health, diagnostics: diag, probe }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  if (error && !diag) return <div className="admin-error">Failed to load diagnostics: {error}</div>;
  if (!diag || !health) return <div className="admin-loading">Loading…</div>;

  const m5 = diag.metrics.last5min;
  const m60 = diag.metrics.last60min;

  return (
    <div>
      <div className="diag-admin-toolbar">
        <button type="button" className="admin-row-action" onClick={load}>Refresh</button>
        <button type="button" className="admin-row-action" onClick={runProbe} disabled={probing}>
          {probing ? 'Probing…' : 'Run live probe'}
        </button>
        <button type="button" className="admin-row-action" onClick={copyJson}>{copied ? 'Copied' : 'Copy JSON'}</button>
        <span className="diag-tone-muted" style={{ fontSize: 11 }}>auto-refreshes every 15s · updated {ago(diag.generatedAt)}</span>
      </div>

      <div className="diag-admin-problems">
        <div className={health.status === 'ok' ? 'diag-tone-ok' : 'diag-tone-bad'}>
          {health.status === 'ok' ? '● Users are getting data' : `● Degraded — ${health.problems.join('; ')}`}
        </div>
        {(health.warnings ?? []).map((w) => (
          <div key={w} className="diag-tone-warn" style={{ marginTop: 4 }}>▲ {w}</div>
        ))}
        <div className="diag-kv" style={{ marginTop: 8 }}>
          <span><b>server</b>{diag.version.version ? `v${diag.version.version} · ` : ''}{diag.version.commit}</span>
          <span><b>this app</b>v{APP_VERSION} · {APP_COMMIT}{APP_COMMIT !== diag.version.commit ? ' (differs)' : ''}</span>
          <span><b>up</b>{duration(diag.process.uptimeSec)}</span>
          <span><b>node</b>{diag.version.node}</span>
          <span><b>rss</b>{diag.process.memoryMb.rss} MB</span>
          <span><b>db</b>{mb(diag.database.sizeBytes)} (+{mb(diag.database.walBytes)} wal)</span>
          {Object.entries(diag.process.env).map(([k, v]) => <span key={k}><b>{k}</b>{String(v)}</span>)}
        </div>
      </div>

      {probe && (
        <div className="diag-admin-block">
          <div className="diag-section-title">Live probe · {ago(probe.probedAt)}{probe.cached ? ' (cached)' : ''} · {probe.ms} ms</div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Upstream</th><th>Result</th><th className="admin-num">ms</th><th>Detail</th></tr></thead>
              <tbody>
                {probe.providers.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className={p.ok ? 'diag-tone-ok' : 'diag-tone-bad'}>{p.ok ? 'reachable' : 'FAILED'}</td>
                    <td className="admin-num">{p.ms}</td>
                    <td>{p.ok ? `${p.aircraft} aircraft within 10 nm of NYC` : p.error}</td>
                  </tr>
                ))}
                <tr>
                  <td>adsbdb</td>
                  <td className={probe.adsbdb.ok ? 'diag-tone-ok' : 'diag-tone-bad'}>{probe.adsbdb.ok ? 'reachable' : 'FAILED'}</td>
                  <td className="admin-num">{probe.adsbdb.ms}</td>
                  <td>{probe.adsbdb.error ?? `HTTP ${probe.adsbdb.status}`}</td>
                </tr>
                {(probe.photos ?? []).map((p) => (
                  <tr key={`photo-${p.name}`}>
                    <td>{p.name} (photos)</td>
                    <td className={p.ok ? 'diag-tone-ok' : 'diag-tone-bad'}>{p.ok ? 'reachable' : 'FAILED'}</td>
                    <td className="admin-num">{p.ms}</td>
                    <td>{p.error ?? `HTTP ${p.status}`}</td>
                  </tr>
                ))}
                <tr>
                  <td>database</td>
                  <td className={probe.database.ok ? 'diag-tone-ok' : 'diag-tone-bad'}>{probe.database.ok ? 'ok' : 'FAILED'}</td>
                  <td className="admin-num">—</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="diag-admin-block">
        <div className="diag-section-title">ADS-B feeds · {diag.adsb.cachedAreas} cached areas</div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Provider</th><th>Last ok</th><th className="admin-num">ms</th><th>ok / fail</th><th>Recent (old → new)</th><th>Last error</th></tr>
            </thead>
            <tbody>
              {diag.adsb.providers.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}{p.coolingDown ? ' · cooling' : ''}</td>
                  <td>{ago(p.lastSuccessAt)}</td>
                  <td className="admin-num">{p.lastLatencyMs ?? '—'}</td>
                  <td>{p.okCount} / {p.failCount}</td>
                  <td className="diag-history">
                    {(p.history ?? []).map((h, i) => (
                      <span key={i} className={h.ok ? 'diag-tone-ok' : 'diag-tone-bad'} title={`${h.at} · ${h.ms} ms${h.error ? ` · ${h.error}` : ''}`}>
                        {h.ok ? '●' : '✕'}
                      </span>
                    ))}
                  </td>
                  <td>{p.lastError ? `${ago(p.lastErrorAt)} — ${p.lastError}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="diag-kv" style={{ marginTop: 8 }}>
          {Object.entries(diag.enrichment).map(([k, v]) => <span key={k}><b>adsbdb.{k}</b>{String(v)}</span>)}
        </div>
      </div>

      {diag.photos && (
        <div className="diag-admin-block">
          <div className="diag-section-title">Photos</div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Provider</th><th>Last ok</th><th>requests / errors</th><th>Last error</th></tr></thead>
              <tbody>
                {diag.photos.providers.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}{p.breakerOpen ? ' · paused' : ''}</td>
                    <td>{ago(p.lastSuccessAt)}</td>
                    <td>{p.requests} / {p.errors}</td>
                    <td>{p.lastError ? `${ago(p.lastErrorAt)} — ${p.lastError}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="diag-kv" style={{ marginTop: 8 }}>
            {Object.entries(diag.photos.outcomesSinceStart).map(([k, v]) => <span key={k}><b>shown.{k}</b>{v}</span>)}
            {diag.photos.cache && Object.entries(diag.photos.cache).map(([k, v]) => <span key={k}><b>cache.{k}</b>{v}</span>)}
          </div>
        </div>
      )}

      <div className="diag-admin-block">
        <div className="diag-section-title">Traffic</div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th /><th>Last 5 min</th><th>Last 60 min</th></tr></thead>
            <tbody>
              <tr><td>Poll outcomes</td><td><CountList counts={m5.pollOutcomes} /></td><td><CountList counts={m60.pollOutcomes} /></td></tr>
              <tr><td>Error codes</td><td><CountList counts={m5.errorCodes} /></td><td><CountList counts={m60.errorCodes} /></td></tr>
              <tr><td>Requests</td><td><CountList counts={m5.requests} /></td><td><CountList counts={m60.requests} /></td></tr>
            </tbody>
          </table>
        </div>
        <div className="diag-kv" style={{ marginTop: 8 }}>
          <span><b>poll latency p50</b>{diag.metrics.pollLatencyMs.p50 ?? '—'} ms</span>
          <span><b>p95</b>{diag.metrics.pollLatencyMs.p95 ?? '—'} ms</span>
          <span><b>max</b>{diag.metrics.pollLatencyMs.max ?? '—'} ms</span>
          <span><b>samples</b>{diag.metrics.pollLatencyMs.samples}</span>
        </div>
      </div>

      <div className="diag-admin-block">
        <div className="diag-section-title">Recent polls</div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>When</th><th>User</th><th>Outcome</th><th>Data</th><th className="admin-num">ms</th><th className="admin-num">In range</th><th className="admin-num">Caught</th><th>Ref</th></tr>
            </thead>
            <tbody>
              {diag.recent.polls.slice(0, 25).map((p, i) => (
                <tr key={i}>
                  <td>{ago(p.at)}</td>
                  <td>{p.user}</td>
                  <td className={BAD_POLL_OUTCOMES.has(p.outcome) ? 'diag-tone-bad' : p.outcome.startsWith('stale') ? 'diag-tone-warn' : 'diag-tone-ok'}>{p.outcome}</td>
                  <td>{p.areaSource ?? '—'}{p.provider ? ` · ${p.provider}` : ''}</td>
                  <td className="admin-num">{p.ms}</td>
                  <td className="admin-num">{p.inRange ?? '—'}</td>
                  <td className="admin-num">{p.recorded ?? '—'}</td>
                  <td>{p.reqId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="diag-admin-block">
        <div className="diag-section-title">Client error reports · what users saw</div>
        {diag.recent.clientReports.length === 0 ? (
          <div className="diag-tone-muted" style={{ fontSize: 12 }}>None since the last restart.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>When</th><th>User</th><th>Kind</th><th>Message</th><th>App</th><th>Ref</th></tr></thead>
              <tbody>
                {diag.recent.clientReports.slice(0, 30).map((r, i) => (
                  <tr key={i}>
                    <td>{ago(r.at)}</td>
                    <td>{r.user}</td>
                    <td>{r.kind}</td>
                    <td title={r.detail ? JSON.stringify(r.detail) : undefined}>{r.message}</td>
                    <td>{r.appVersion ?? '—'}</td>
                    <td>{r.requestId ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="diag-admin-block">
        <div className="diag-section-title">Server warnings &amp; errors</div>
        {diag.recent.logs.length === 0 ? (
          <div className="diag-tone-muted" style={{ fontSize: 12 }}>None since the last restart.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Last</th><th>Level</th><th>Module</th><th>Message</th><th className="admin-num">×</th><th>Detail</th></tr></thead>
              <tbody>
                {diag.recent.logs.slice(0, 40).map((l, i) => (
                  <tr key={i}>
                    <td>{ago(l.lastAt)}</td>
                    <td className={l.level === 'warn' ? 'diag-tone-warn' : 'diag-tone-bad'}>{l.level}</td>
                    <td>{l.module ?? '—'}</td>
                    <td>{l.msg}</td>
                    <td className="admin-num">{l.count}</td>
                    <td>{Object.keys(l.detail).length ? JSON.stringify(l.detail) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
