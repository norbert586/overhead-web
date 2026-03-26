import { useState, useEffect } from 'react';
import { fetchLog } from '../services/api';
import { fetchPhoto, thumbnailFallback } from '../utils/photos';
import type { Flight } from '../types/flight';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins   = Math.floor(diffMs / 60_000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days  = Math.floor(hours / 24);
  if (days  < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRoute(f: Flight): string {
  if (!f.originIata && !f.destinationIata) return '—';
  const o = f.originIata      ?? '???';
  const d = f.destinationIata ?? '???';
  return `${o} → ${d}`;
}

function formatAlt(ft: number | null): string {
  if (ft == null) return '—';
  return `${Math.round(ft / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ft';
}

// ── Chevron icon ─────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`log-chevron${open ? ' open' : ''}`}
      aria-hidden="true"
    >
      <polyline points="2,4 6,8 10,4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Photo loader (per expanded row) ─────────────────────────────────────────

function RowPhoto({ registration }: { registration: string | null }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [src,   setSrc  ] = useState<string | null>(null);
  const [fb,    setFb   ] = useState<string | null>(null);

  if (!registration) {
    return <div className="log-photo-unavailable">No registration — photo unavailable</div>;
  }

  async function load() {
    setState('loading');
    const url = await fetchPhoto(registration!);
    if (!url) { setState('error'); return; }
    const fallback = thumbnailFallback(url);
    setSrc(url);
    if (fallback !== url) setFb(fallback);
    setState('done');
  }

  function handleError(e: React.SyntheticEvent<HTMLImageElement>) {
    if (fb && (e.target as HTMLImageElement).src !== fb) {
      setSrc(fb);
    } else {
      setState('error');
      setSrc(null);
    }
  }

  if (state === 'idle') {
    return (
      <button className="log-photo-btn" onClick={load}>
        ↓ Load photo
      </button>
    );
  }
  if (state === 'loading') return <div className="log-photo-loading">Loading…</div>;
  if (state === 'error' || !src) return <div className="log-photo-unavailable">No photo available</div>;

  return (
    <img
      className="log-photo-img"
      src={src}
      alt={registration}
      onError={handleError}
    />
  );
}

// ── Single log row ───────────────────────────────────────────────────────────

function LogRow({ flight: f }: { flight: Flight }) {
  const [open, setOpen] = useState(false);

  const typeLabel = [f.manufacturer, f.aircraftType].filter(Boolean).join(' ') || '—';

  return (
    <div className={`log-row${open ? ' expanded' : ''}`}>
      {/* Main clickable line */}
      <button
        className="log-row-main"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="log-dot-col">
          <span className={`log-dot ${f.classification}`} />
        </span>
        <span className="log-callsign">{f.callsign ?? '——'}</span>
        <span className="log-type">{typeLabel}</span>
        <span className="log-route">{formatRoute(f)}</span>
        <span className="log-time">{timeAgo(f.lastSeen)}</span>
        <span className="log-seen">×{f.timesSeen}</span>
        <span className="log-chevron-col"><Chevron open={open} /></span>
      </button>

      {/* Expanded detail panel */}
      {open && (
        <div className="log-detail">
          <div className="log-detail-grid">
            {/* Left intel column */}
            <div className="log-detail-col">
              <div className="log-detail-section-label">Identity</div>
              {[
                ['Callsign',       f.callsign],
                ['Registration',   f.registration],
                ['Hex',            f.hex],
                ['Aircraft',       typeLabel !== '—' ? typeLabel : null],
                ['Operator',       f.operator],
                ['Owner',          f.owner],
                ['Country',        f.country],
              ].map(([label, val]) => val ? (
                <div className="log-detail-row" key={String(label)}>
                  <span className="log-detail-label">{label}</span>
                  <span className="log-detail-value">{String(val)}</span>
                </div>
              ) : null)}
            </div>

            {/* Right telemetry + timeline column */}
            <div className="log-detail-col">
              <div className="log-detail-section-label">Flight data</div>
              {[
                ['Route',         f.originIata && f.destinationIata
                                    ? `${f.originIata} → ${f.destinationIata}` : null],
                ['Origin',        f.originCity && f.originCountry
                                    ? `${f.originCity}, ${f.originCountry}` : f.originCity],
                ['Destination',   f.destinationCity && f.destinationCountry
                                    ? `${f.destinationCity}, ${f.destinationCountry}` : f.destinationCity],
                ['Altitude',      formatAlt(f.altitudeFt)],
                ['Speed',         f.speedKts  != null ? `${f.speedKts} kts`  : null],
                ['Bearing',       f.bearingDeg != null ? `${f.bearingDeg}°`  : null],
                ['Distance',      f.distanceNm != null ? `${f.distanceNm} nm`: null],
                ['Classification',f.classification],
                ['Times seen',    String(f.timesSeen)],
                ['First seen',    f.firstSeen ? timeAgo(f.firstSeen) : null],
                ['Last seen',     f.lastSeen  ? timeAgo(f.lastSeen)  : null],
              ].map(([label, val]) => val ? (
                <div className="log-detail-row" key={String(label)}>
                  <span className="log-detail-label">{label}</span>
                  <span className="log-detail-value">{String(val)}</span>
                </div>
              ) : null)}
            </div>
          </div>

          {/* Photo section */}
          <div className="log-photo-section">
            <div className="log-detail-section-label" style={{ marginBottom: 10 }}>Photo</div>
            <RowPhoto registration={f.registration} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Column header ─────────────────────────────────────────────────────────────

function ListHeader() {
  return (
    <div className="log-list-header">
      <span className="log-dot-col" />
      <span className="log-col-label">Callsign</span>
      <span className="log-col-label">Aircraft</span>
      <span className="log-col-label">Route</span>
      <span className="log-col-label">Last seen</span>
      <span className="log-col-label log-col-right">Seen</span>
      <span className="log-chevron-col" />
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

const LIMIT_OPTIONS = [50, 100, 200] as const;

export default function LogScreen() {
  const [limit,    setLimit   ] = useState<50 | 100 | 200>(50);
  const [flights,  setFlights ] = useState<Flight[]>([]);
  const [total,    setTotal   ] = useState(0);
  const [loading,  setLoading ] = useState(true);
  const [error,    setError   ] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchLog(limit)
      .then(({ flights, total }) => {
        setFlights(flights);
        setTotal(total);
      })
      .catch(() => setError('Failed to load flight log.'))
      .finally(() => setLoading(false));
  }, [limit]);

  return (
    <div className="log-screen">
      {/* Header bar */}
      <div className="log-header">
        <div className="log-header-left">
          <span className="log-title">Flight Log</span>
          {!loading && (
            <span className="log-total">
              {total.toLocaleString()} events stored
            </span>
          )}
        </div>
        <div className="log-header-right">
          <span className="log-limit-label">Show</span>
          <select
            className="log-limit-select"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) as 50 | 100 | 200)}
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} flights</option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="log-list">
        {loading && (
          <div className="log-empty">Loading…</div>
        )}
        {!loading && error && (
          <div className="log-empty log-error">{error}</div>
        )}
        {!loading && !error && flights.length === 0 && (
          <div className="log-empty">No flights recorded yet.</div>
        )}
        {!loading && !error && flights.length > 0 && (
          <>
            <ListHeader />
            {flights.map((f) => (
              <LogRow key={`${f.hex}-${f.firstSeen}`} flight={f} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
