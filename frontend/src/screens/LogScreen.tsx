import { useState, useEffect, useMemo } from 'react';
import { fetchLog } from '../services/api';
import { fetchPhoto, fetchPhotoByType, thumbnailFallback } from '../utils/photos';
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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
}

function formatDuration(firstSeen: string, lastSeen: string): string {
  const ms = new Date(lastSeen).getTime() - new Date(firstSeen).getTime();
  if (ms <= 0) return '< 1s';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

function RowPhoto({ registration, aircraftType }: { registration: string | null; aircraftType?: string | null }) {
  const [state,  setState ] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [src,    setSrc   ] = useState<string | null>(null);
  const [fb,     setFb    ] = useState<string | null>(null);
  const [source, setSource] = useState<'planespotters' | 'similar' | null>(null);

  if (!registration && !aircraftType) {
    return <div className="log-photo-unavailable">No registration — photo unavailable</div>;
  }

  async function load() {
    setState('loading');
    if (registration) {
      const url = await fetchPhoto(registration);
      if (url) {
        const fallback = thumbnailFallback(url);
        setSrc(url);
        if (fallback !== url) setFb(fallback);
        setSource('planespotters');
        setState('done');
        return;
      }
    }
    if (aircraftType) {
      const url = await fetchPhotoByType(aircraftType);
      if (url) {
        const fallback = thumbnailFallback(url);
        setSrc(url);
        if (fallback !== url) setFb(fallback);
        setSource('similar');
        setState('done');
        return;
      }
    }
    setState('error');
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

  const sourceLabel = source === 'similar'
    ? `SIMILAR · ${aircraftType ?? ''}`
    : 'PLANESPOTTERS';

  return (
    <div className="log-photo-wrap">
      <img className="log-photo-img" src={src} alt={registration ?? aircraftType ?? 'Aircraft'} onError={handleError} />
      <div className="log-photo-source">{sourceLabel}</div>
    </div>
  );
}

// ── Expanded detail — shared row ──────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="log-detail-row">
      <span className="log-detail-label">{label}</span>
      <span className="log-detail-value">{value}</span>
    </div>
  );
}

// ── Expanded detail — tab contents ────────────────────────────────────────────

type DetailTab = 'details' | 'flight' | 'ingestion';

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'details',   label: 'Details'   },
  { key: 'flight',    label: 'Flight'    },
  { key: 'ingestion', label: 'Ingestion' },
];

function DetailsTab({ f, typeLabel }: { f: Flight; typeLabel: string }) {
  return (
    <div className="log-tab-content log-tab-details">
      <div className="log-detail-col">
        <DetailRow label="Callsign"     value={f.callsign} />
        <DetailRow label="Registration" value={f.registration} />
        <DetailRow label="Aircraft"     value={typeLabel !== '—' ? typeLabel : null} />
        <DetailRow label="Manufacturer" value={f.manufacturer} />
        <DetailRow label="Operator"     value={f.operator} />
        <DetailRow label="Owner"        value={f.owner} />
        <DetailRow label="Country"      value={f.country} />
      </div>
      <div className="log-photo-section">
        <div className="log-detail-section-label" style={{ marginBottom: 10 }}>Photo</div>
        <RowPhoto registration={f.registration} aircraftType={f.aircraftType} />
      </div>
    </div>
  );
}

function FlightTab({ f }: { f: Flight }) {
  const originFull = f.originCity
    ? [f.originCity, f.originCountry].filter(Boolean).join(', ')
    : null;
  const destFull = f.destinationCity
    ? [f.destinationCity, f.destinationCountry].filter(Boolean).join(', ')
    : null;
  return (
    <div className="log-tab-content">
      <div className="log-detail-col">
        <DetailRow label="Route"          value={f.originIata && f.destinationIata ? `${f.originIata} → ${f.destinationIata}` : null} />
        <DetailRow label="Origin"         value={originFull} />
        <DetailRow label="Destination"    value={destFull} />
        <DetailRow label="Altitude"       value={formatAlt(f.altitudeFt)} />
        <DetailRow label="Speed"          value={f.speedKts   != null ? `${f.speedKts} kts` : null} />
        <DetailRow label="Bearing"        value={f.bearingDeg != null ? `${f.bearingDeg}°`  : null} />
        <DetailRow label="Distance"       value={f.distanceNm != null ? `${f.distanceNm} nm` : null} />
        <DetailRow label="Classification" value={f.classification} />
      </div>
    </div>
  );
}

function IngestionTab({ f }: { f: Flight }) {
  return (
    <div className="log-tab-content">
      <div className="log-detail-col">
        <DetailRow label="ICAO hex"   value={f.hex} />
        <DetailRow label="Times seen" value={String(f.timesSeen)} />
        <DetailRow label="Duration"   value={formatDuration(f.firstSeen, f.lastSeen)} />
        <DetailRow label="First seen" value={formatDateTime(f.firstSeen)} />
        <DetailRow label="Last seen"  value={formatDateTime(f.lastSeen)} />
      </div>
    </div>
  );
}

// ── Single log row ────────────────────────────────────────────────────────────

function LogRow({ flight: f }: { flight: Flight }) {
  const [open, setOpen] = useState(false);
  const [tab,  setTab ] = useState<DetailTab>('details');
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
          <div className="log-detail-tabs">
            {DETAIL_TABS.map(({ key, label }) => (
              <button
                key={key}
                className={`log-detail-tab${tab === key ? ' active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="log-detail-body">
            {tab === 'details'   && <DetailsTab   f={f} typeLabel={typeLabel} />}
            {tab === 'flight'    && <FlightTab    f={f} />}
            {tab === 'ingestion' && <IngestionTab f={f} />}
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
      <span className="log-col-label log-col-aircraft">Aircraft</span>
      <span className="log-col-label log-col-route">Route</span>
      <span className="log-col-label">Last seen</span>
      <span className="log-col-label log-col-right log-col-seen">Seen</span>
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
  dateFrom: string;
  onDateFrom: (v: string) => void;
  dateTo: string;
  onDateTo: (v: string) => void;
  onClearDates: () => void;
  count: number;
  total: number;
}

function FilterBar({
  search, onSearch,
  classFilter, onClass,
  dateFrom, onDateFrom,
  dateTo, onDateTo,
  onClearDates,
  count, total,
}: FilterBarProps) {
  const hasDates = dateFrom || dateTo;
  return (
    <div className="log-filter-bar">
      <div className="log-filter-row log-filter-top">
        <input
          className="log-search"
          type="text"
          placeholder="Search callsign, registration, type…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          spellCheck={false}
        />
        <div className="log-date-range">
          <span className="log-date-label">From</span>
          <input
            className="log-date-input"
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => onDateFrom(e.target.value)}
          />
          <span className="log-date-label">To</span>
          <input
            className="log-date-input"
            type="datetime-local"
            value={dateTo}
            onChange={(e) => onDateTo(e.target.value)}
          />
          {hasDates && (
            <button className="log-date-clear" onClick={onClearDates} title="Clear date range">✕</button>
          )}
        </div>
      </div>
      <div className="log-filter-row log-filter-bottom">
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
  const [dateFrom,    setDateFrom   ] = useState('');
  const [dateTo,      setDateTo     ] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    const fromISO = dateFrom ? new Date(dateFrom).toISOString() : undefined;
    const toISO   = dateTo   ? new Date(dateTo).toISOString()   : undefined;
    fetchLog(limit, 0, fromISO, toISO)
      .then(({ flights, total }) => { setFlights(flights); setTotal(total); })
      .catch(() => setError('Failed to load flight log.'))
      .finally(() => setLoading(false));
  }, [limit, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flights.filter((f) => {
      if (classFilter !== 'all' && f.classification !== classFilter) return false;
      if (!q) return true;
      return (
        f.callsign?.toLowerCase().includes(q)        ||
        f.registration?.toLowerCase().includes(q)    ||
        f.aircraftType?.toLowerCase().includes(q)    ||
        f.manufacturer?.toLowerCase().includes(q)    ||
        f.operator?.toLowerCase().includes(q)        ||
        f.originIata?.toLowerCase().includes(q)      ||
        f.destinationIata?.toLowerCase().includes(q)
      );
    });
  }, [flights, search, classFilter]);

  return (
    <div className="log-screen">
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

      {!loading && !error && (
        <FilterBar
          search={search}
          onSearch={setSearch}
          classFilter={classFilter}
          onClass={setClassFilter}
          dateFrom={dateFrom}
          onDateFrom={setDateFrom}
          dateTo={dateTo}
          onDateTo={setDateTo}
          onClearDates={() => { setDateFrom(''); setDateTo(''); }}
          count={filtered.length}
          total={total}
        />
      )}

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
