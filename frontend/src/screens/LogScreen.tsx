import { useState, useEffect, useMemo } from 'react';
import { fetchLog } from '../services/api';
import { fetchPhoto, thumbnailFallback } from '../utils/photos';
import type { Flight, Classification } from '../types/flight';

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
  return `${f.originIata ?? '???'} → ${f.destinationIata ?? '???'}`;
}

function formatAlt(ft: number | null): string {
  if (ft == null) return '—';
  return `${Math.round(ft / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ft';
}

// ── Icons ────────────────────────────────────────────────────────────────────

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={`log-chevron${open ? ' open' : ''}`} aria-hidden="true">
      <polyline points="2,4 6,8 10,4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Photo loader ─────────────────────────────────────────────────────────────

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
    return <button className="log-photo-btn" onClick={load}>↓ Load photo</button>;
  }
  if (state === 'loading') return <div className="log-photo-loading">Loading…</div>;
  if (state === 'error' || !src) return <div className="log-photo-unavailable">No photo available</div>;

  return (
    <img className="log-photo-img" src={src} alt={registration} onError={handleError} />
  );
}

// ── Single log row ────────────────────────────────────────────────────────────

function LogRow({ flight: f }: { flight: Flight }) {
  const [open, setOpen] = useState(false);
  const typeLabel = [f.manufacturer, f.aircraftType].filter(Boolean).join(' ') || '—';

  return (
    <div className={`log-row${open ? ' expanded' : ''}`}>
      <button className="log-row-main" onClick={() => setOpen(!open)} aria-expanded={open}>
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

      {open && (
        <div className="log-detail">
          <div className="log-detail-grid">
            <div className="log-detail-col">
              <div className="log-detail-section-label">Identity</div>
              {([
                ['Callsign',     f.callsign],
                ['Registration', f.registration],
                ['Hex',          f.hex],
                ['Aircraft',     typeLabel !== '—' ? typeLabel : null],
                ['Operator',     f.operator],
                ['Owner',        f.owner],
                ['Country',      f.country],
              ] as [string, string | null][]).map(([label, val]) => val ? (
                <div className="log-detail-row" key={label}>
                  <span className="log-detail-label">{label}</span>
                  <span className="log-detail-value">{val}</span>
                </div>
              ) : null)}
            </div>

            <div className="log-detail-col">
              <div className="log-detail-section-label">Flight data</div>
              {([
                ['Route',          f.originIata && f.destinationIata ? `${f.originIata} → ${f.destinationIata}` : null],
                ['Origin',         f.originCity  ? [f.originCity,      f.originCountry     ].filter(Boolean).join(', ') : null],
                ['Destination',    f.destinationCity ? [f.destinationCity, f.destinationCountry].filter(Boolean).join(', ') : null],
                ['Altitude',       formatAlt(f.altitudeFt)],
                ['Speed',          f.speedKts   != null ? `${f.speedKts} kts`  : null],
                ['Bearing',        f.bearingDeg != null ? `${f.bearingDeg}°`   : null],
                ['Distance',       f.distanceNm != null ? `${f.distanceNm} nm` : null],
                ['Classification', f.classification],
                ['Times seen',     String(f.timesSeen)],
                ['First seen',     f.firstSeen ? timeAgo(f.firstSeen) : null],
                ['Last seen',      f.lastSeen  ? timeAgo(f.lastSeen)  : null],
              ] as [string, string | null][]).map(([label, val]) => val ? (
                <div className="log-detail-row" key={label}>
                  <span className="log-detail-label">{label}</span>
                  <span className="log-detail-value">{val}</span>
                </div>
              ) : null)}
            </div>
          </div>

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

// ── Filter bar ────────────────────────────────────────────────────────────────

type ClassFilter = 'all' | Classification;

const CLASS_PILLS: { key: ClassFilter; label: string }[] = [
  { key: 'all',        label: 'All'        },
  { key: 'commercial', label: 'Commercial' },
  { key: 'private',    label: 'Private'    },
  { key: 'cargo',      label: 'Cargo'      },
  { key: 'government', label: 'Gov / Mil'  },
  { key: 'unknown',    label: 'Unknown'    },
];

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  classFilter: ClassFilter;
  onClass: (v: ClassFilter) => void;
  count: number;
  total: number;
}

function FilterBar({ search, onSearch, classFilter, onClass, count, total }: FilterBarProps) {
  return (
    <div className="log-filter-bar">
      <input
        className="log-search"
        type="text"
        placeholder="Search callsign, registration, type…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        spellCheck={false}
      />
      <div className="log-filter-pills">
        {CLASS_PILLS.map(({ key, label }) => (
          <button
            key={key}
            className={`log-pill${classFilter === key ? ' active' : ''}${key !== 'all' ? ` pill-${key}` : ''}`}
            onClick={() => onClass(key)}
          >
            {key !== 'all' && <span className={`log-dot ${key}`} style={{ marginRight: 5 }} />}
            {label}
          </button>
        ))}
      </div>
      <span className="log-filter-count">
        {count < total ? `${count} / ${total}` : total.toLocaleString()} events
      </span>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

const LIMIT_OPTIONS = [50, 100, 200] as const;

export default function LogScreen() {
  const [limit,       setLimit      ] = useState<50 | 100 | 200>(50);
  const [flights,     setFlights    ] = useState<Flight[]>([]);
  const [total,       setTotal      ] = useState(0);
  const [loading,     setLoading    ] = useState(true);
  const [error,       setError      ] = useState<string | null>(null);
  const [search,      setSearch     ] = useState('');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchLog(limit)
      .then(({ flights, total }) => { setFlights(flights); setTotal(total); })
      .catch(() => setError('Failed to load flight log.'))
      .finally(() => setLoading(false));
  }, [limit]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flights.filter((f) => {
      if (classFilter !== 'all' && f.classification !== classFilter) return false;
      if (!q) return true;
      return (
        f.callsign?.toLowerCase().includes(q)       ||
        f.registration?.toLowerCase().includes(q)   ||
        f.aircraftType?.toLowerCase().includes(q)   ||
        f.manufacturer?.toLowerCase().includes(q)   ||
        f.operator?.toLowerCase().includes(q)       ||
        f.originIata?.toLowerCase().includes(q)     ||
        f.destinationIata?.toLowerCase().includes(q)
      );
    });
  }, [flights, search, classFilter]);

  return (
    <div className="log-screen">
      {/* Header */}
      <div className="log-header">
        <div className="log-header-left">
          <span className="log-title">Flight Log</span>
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

      {/* Filter bar */}
      {!loading && !error && (
        <FilterBar
          search={search}
          onSearch={setSearch}
          classFilter={classFilter}
          onClass={setClassFilter}
          count={filtered.length}
          total={total}
        />
      )}

      {/* List */}
      <div className="log-list">
        {loading && <div className="log-empty">Loading…</div>}
        {!loading && error && <div className="log-empty log-error">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="log-empty">
            {flights.length === 0 ? 'No flights recorded yet.' : 'No flights match the current filter.'}
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <>
            <ListHeader />
            {filtered.map((f) => (
              <LogRow key={`${f.hex}-${f.firstSeen}`} flight={f} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
