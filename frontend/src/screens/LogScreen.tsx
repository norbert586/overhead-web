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

// Converts a Date to the value expected by <input type="datetime-local">
function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [state,        setState       ] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [src,          setSrc         ] = useState<string | null>(null);
  const [fb,           setFb          ] = useState<string | null>(null);
  const [source,       setSource      ] = useState<'planespotters' | 'similar' | null>(null);
  const [surrogateReg, setSurrogateReg] = useState<string | null>(null);

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
        setSurrogateReg(null);
        setState('done');
        return;
      }
    }
    if (aircraftType) {
      const match = await fetchPhotoByType(aircraftType, registration);
      if (match) {
        const fallback = thumbnailFallback(match.url);
        setSrc(match.url);
        if (fallback !== match.url) setFb(fallback);
        setSource('similar');
        setSurrogateReg(match.registration);
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
    ? `SIMILAR · ${aircraftType ?? ''}${surrogateReg ? ` · ${surrogateReg}` : ''}`
    : 'PLANESPOTTERS';

  return (
    <div className="log-photo-wrap">
      <img className="log-photo-img" src={src} alt={registration ?? aircraftType ?? 'Aircraft'} onError={handleError} />
      <div className="log-photo-source">{sourceLabel}</div>
      {source === 'similar' && (
        <div className="log-photo-similar-note">
          Different airframe, same model{surrogateReg ? ` (${surrogateReg})` : ''}.
        </div>
      )}
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

const DATE_PRESETS: { label: string; range: () => [Date, Date] }[] = [
  { label: 'Today', range: () => { const n = new Date(); const s = new Date(n); s.setHours(0,0,0,0); return [s, n]; } },
  { label: '24h',   range: () => { const n = new Date(); return [new Date(n.getTime() - 86_400_000), n]; } },
  { label: '7d',    range: () => { const n = new Date(); return [new Date(n.getTime() - 7 * 86_400_000), n]; } },
  { label: '30d',   range: () => { const n = new Date(); return [new Date(n.getTime() - 30 * 86_400_000), n]; } },
];

interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  classFilter: ClassFilter;
  onClass: (v: ClassFilter) => void;
  appliedFrom: string;
  appliedTo: string;
  onApplyDates: (fromISO: string, toISO: string) => void;
  count: number;
  total: number;
}

function FilterBar({
  search, onSearch,
  classFilter, onClass,
  appliedFrom, appliedTo, onApplyDates,
  count, total,
}: FilterBarProps) {
  const [draftFrom,    setDraftFrom   ] = useState('');
  const [draftTo,      setDraftTo     ] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const isApplied = !!(appliedFrom || appliedTo);
  const isDirty   = draftFrom !== '' || draftTo !== '';

  function applyPreset(label: string, range: () => [Date, Date]) {
    const [s, e] = range();
    setDraftFrom(toDateTimeLocal(s));
    setDraftTo(toDateTimeLocal(e));
    setActivePreset(label);
    onApplyDates(s.toISOString(), e.toISOString());
  }

  function handleApply() {
    setActivePreset(null);
    onApplyDates(
      draftFrom ? new Date(draftFrom).toISOString() : '',
      draftTo   ? new Date(draftTo).toISOString()   : '',
    );
  }

  function handleClear() {
    setDraftFrom('');
    setDraftTo('');
    setActivePreset(null);
    onApplyDates('', '');
  }

  function handleInput(which: 'from' | 'to', val: string) {
    if (which === 'from') setDraftFrom(val);
    else                  setDraftTo(val);
    setActivePreset(null);
  }

  return (
    <div className="log-filter-bar">

      {/* ── Row 1: search + date range ── */}
      <div className="log-filter-row log-filter-top">
        <input
          className="log-search"
          type="text"
          placeholder="Search callsign, registration, type…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          spellCheck={false}
        />

        <div className={`log-date-filter${isApplied ? ' applied' : ''}`}>
          {/* Quick presets */}
          <div className="log-preset-group">
            {DATE_PRESETS.map(({ label, range }) => (
              <button
                key={label}
                className={`log-preset-btn${activePreset === label ? ' active' : ''}`}
                onClick={() => applyPreset(label, range)}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="log-date-divider" aria-hidden="true" />

          {/* Manual inputs */}
          <div className="log-date-inputs">
            <div className="log-date-field">
              <span className="log-date-field-label">From</span>
              <input
                className="log-date-input"
                type="datetime-local"
                value={draftFrom}
                onChange={(e) => handleInput('from', e.target.value)}
              />
            </div>
            <span className="log-date-arrow" aria-hidden="true">→</span>
            <div className="log-date-field">
              <span className="log-date-field-label">To</span>
              <input
                className="log-date-input"
                type="datetime-local"
                value={draftTo}
                onChange={(e) => handleInput('to', e.target.value)}
              />
            </div>
            <button
              className={`log-date-apply${isDirty ? ' ready' : ''}`}
              onClick={handleApply}
            >
              Apply
            </button>
            {isApplied && (
              <button className="log-date-clear" onClick={handleClear} title="Clear date filter">✕</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: classification pills + count ── */}
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
  // Only ISO strings committed by Apply/preset — never changes on raw input
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo,   setAppliedTo  ] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchLog(limit, 0, appliedFrom || undefined, appliedTo || undefined)
      .then(({ flights, total }) => { setFlights(flights); setTotal(total); })
      .catch(() => setError('Failed to load flight log.'))
      .finally(() => setLoading(false));
  }, [limit, appliedFrom, appliedTo]);

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
          appliedFrom={appliedFrom}
          appliedTo={appliedTo}
          onApplyDates={(from, to) => { setAppliedFrom(from); setAppliedTo(to); }}
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
