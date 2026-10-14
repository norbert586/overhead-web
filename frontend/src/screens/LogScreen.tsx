import { useState, useEffect, useMemo } from 'react';
import { fetchLog } from '../services/api';
import { readCache, writeCache } from '../utils/swrCache';
import { resolvePhotos, photoCredit, photoMatchLabel, photoSearchUrl } from '../utils/photos';
import type { PhotoCandidate, PhotoResult } from '../types/photo';
import SmartPhoto from '../components/SmartPhoto';
import AircraftSilhouette from '../components/AircraftSilhouette';
import ShareCatchButton from '../components/ShareCatch';
import type { Flight, Classification, InterestTier } from '../types/flight';
import { CLASS_LABEL, TIER_LABEL } from '../utils/labels';

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
    ', ' +
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

// ── Photo ────────────────────────────────────────────────────────────────────

function RowPhoto({ registration, hex, aircraftType, callsign }: {
  registration: string | null;
  hex?: string | null;
  aircraftType?: string | null;
  callsign?: string | null;
}) {
  const subjectKey = `${hex ?? ''}|${registration ?? ''}|${aircraftType ?? ''}|${callsign ?? ''}`;
  const [loaded, setLoaded] = useState<{ key: string; result: PhotoResult } | null>(null);
  const [zoomed, setZoomed] = useState<PhotoCandidate | null>(null);
  const result = loaded?.key === subjectKey ? loaded.result : null;
  const hasIdentity = !!(registration || hex || aircraftType);

  // The detail panel only mounts when a row is opened, and the lookup is one
  // cached request, so load straight away.
  useEffect(() => {
    if (!hasIdentity) return;
    let cancelled = false;
    resolvePhotos({ hex: hex ?? null, registration, aircraftType: aircraftType ?? null, callsign })
      .then((r) => { if (!cancelled) setLoaded({ key: subjectKey, result: r }); })
      .catch(() => { if (!cancelled) setLoaded({ key: subjectKey, result: { candidates: [], complete: false } }); });
    return () => { cancelled = true; };
  }, [subjectKey, hasIdentity, hex, registration, aircraftType, callsign]);

  if (!hasIdentity) {
    return <div className="log-photo-unavailable">No identifiers — photo unavailable</div>;
  }

  const caption = registration ?? aircraftType ?? 'Aircraft';
  const notFound = (
    <div className="log-photo-frame">
      <AircraftSilhouette aircraftType={aircraftType ?? null} searching={false} searchUrl={photoSearchUrl(registration)} />
    </div>
  );
  if (!result) {
    return <div className="log-photo-frame"><AircraftSilhouette aircraftType={aircraftType ?? null} searching /></div>;
  }
  if (!result.candidates.length) return notFound;

  return (
    <div className="log-photo-frame">
      <SmartPhoto candidates={result.candidates} alt={caption}>
        {({ active, loaded: shown, exhausted }) => {
          if (exhausted) return <AircraftSilhouette aircraftType={aircraftType ?? null} searching={false} searchUrl={photoSearchUrl(registration)} />;
          if (!active || !shown) return <AircraftSilhouette aircraftType={aircraftType ?? null} searching />;
          const label = photoMatchLabel(active, aircraftType ?? null);
          return (
            <>
              {label && <div className="photo-match-label">{label}</div>}
              <button
                type="button"
                className="log-photo-zoom-btn"
                onClick={() => setZoomed(active)}
                title="View larger"
                aria-label="View photo larger"
              >⤢</button>
              <PhotoCreditLine photo={active} className="log-photo-credit" />
            </>
          );
        }}
      </SmartPhoto>
      {zoomed && (
        <PhotoLightbox photo={zoomed} alt={caption} label={photoMatchLabel(zoomed, aircraftType ?? null)} onClose={() => setZoomed(null)} />
      )}
    </div>
  );
}

function PhotoCreditLine({ photo, className }: { photo: PhotoCandidate; className: string }) {
  return photo.link
    ? <a className={className} href={photo.link} target="_blank" rel="noopener">{photoCredit(photo)}</a>
    : <span className={className}>{photoCredit(photo)}</span>;
}

function PhotoLightbox({ photo, alt, label, onClose }: {
  photo: PhotoCandidate;
  alt: string;
  label: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const img = <img className="log-lightbox-img" src={photo.url} alt={alt} />;
  return (
    <div className="log-lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <button className="log-lightbox-close" onClick={onClose} aria-label="Close">✕</button>
      <div className="log-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        {photo.link ? <a href={photo.link} target="_blank" rel="noopener">{img}</a> : img}
        <div className="log-lightbox-meta">
          <span className="log-lightbox-caption">{alt}</span>
          <PhotoCreditLine photo={photo} className="log-lightbox-source" />
        </div>
        {label && <div className="log-lightbox-note">{label} — not the aircraft you caught.</div>}
      </div>
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

// ── Rarity / interest helpers ────────────────────────────────────────────────


type SeenTier = 'new' | 'familiar' | 'regular' | 'frequent' | 'signature';

function seenTier(count: number): SeenTier {
  if (count >= 50) return 'signature';
  if (count >= 20) return 'frequent';
  if (count >= 8)  return 'regular';
  if (count >= 3)  return 'familiar';
  return 'new';
}

const SEEN_TIER_LABEL: Record<SeenTier, string> = {
  signature: 'Signature',
  frequent:  'Frequent',
  regular:   'Regular',
  familiar:  'Familiar',
  new:       '',
};

function SeenBadge({ count }: { count: number }) {
  const tier = seenTier(count);
  const label = SEEN_TIER_LABEL[tier];
  return (
    <span className={`log-seen-badge seen-tier-${tier}`} title={label ? `${label} — seen ${count}×` : `Seen ${count}×`}>
      {tier === 'signature' && <span className="log-seen-flame" aria-hidden="true">★</span>}
      <span className="log-seen-count">×{count}</span>
    </span>
  );
}

function RarityChip({ tier, score }: { tier: InterestTier; score: number }) {
  if (tier === 'routine') return null;
  return (
    <span className={`log-rarity-chip tier-${tier}`} title={`Interest score ${score}/100`}>
      {TIER_LABEL[tier]}
    </span>
  );
}

// ── Expanded detail — tab contents ────────────────────────────────────────────

type DetailTab = 'details' | 'flight' | 'rarity' | 'ingestion';

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'details',   label: 'Details'   },
  { key: 'flight',    label: 'Flight'    },
  { key: 'rarity',    label: 'Rarity'    },
  { key: 'ingestion', label: 'Your catch' },
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
        <RowPhoto registration={f.registration} hex={f.hex} aircraftType={f.aircraftType} callsign={f.callsign} />
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
        <DetailRow label="Speed"          value={f.speedKts   != null ? `${Math.round(f.speedKts)} kt` : null} />
        <DetailRow label="Heading"        value={f.bearingDeg != null ? `${Math.round(f.bearingDeg)}°`  : null} />
        <DetailRow label="Closest seen"   value={f.distanceNm != null ? `${f.distanceNm.toFixed(1)} nm` : null} />
        <DetailRow label="Kind"           value={CLASS_LABEL[f.classification]} />
      </div>
    </div>
  );
}

function RarityTab({ f }: { f: Flight }) {
  const score = f.interestScore;
  const tier = f.interestTier;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="log-tab-content log-tab-rarity">
      <div className="log-detail-col">
        <div className={`log-rarity-summary tier-${tier}`}>
          <div className="log-rarity-score-row">
            <span className="log-rarity-score">{score}</span>
            <span className="log-rarity-score-out">/100</span>
            <span className={`log-rarity-tier-pill tier-${tier}`}>{TIER_LABEL[tier]}</span>
          </div>
          <div className="log-rarity-bar">
            <div className={`log-rarity-bar-fill tier-${tier}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        {f.interestReasons.length > 0 ? (
          <div className="log-rarity-reasons">
            <div className="log-detail-section-label">Why it stands out</div>
            <ul className="log-rarity-reason-list">
              {f.interestReasons.map((r, i) => (
                <li key={i} className="log-rarity-reason">{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="log-rarity-reasons-empty">Nothing unusual — everyday traffic.</div>
        )}
      </div>
    </div>
  );
}

function IngestionTab({ f }: { f: Flight }) {
  return (
    <div className="log-tab-content">
      <div className="log-detail-col">
        <DetailRow label="Transponder code" value={f.hex.toUpperCase()} />
        <DetailRow label="Times caught" value={String(f.timesSeen)} />
        <DetailRow label="In range for" value={formatDuration(f.firstSeen, f.lastSeen)} />
        <DetailRow label="First caught" value={formatDateTime(f.firstSeen)} />
        <DetailRow label="Last caught" value={formatDateTime(f.lastSeen)} />
        <DetailRow
          label="Caught from"
          value={f.caughtLat != null && f.caughtLon != null
            ? `${f.caughtLat.toFixed(3)}°, ${f.caughtLon.toFixed(3)}°`
            : null}
        />
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
    <div className={`log-row strip--${f.classification}${open ? ' expanded' : ''}`}>
      <button className="log-row-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="log-callsign">{f.callsign ?? f.registration ?? 'No callsign'}</span>
        <span className="log-type">
          {typeLabel}
          {f.operator && <span className="log-operator">{f.operator}</span>}
        </span>
        <span className="log-route">{formatRoute(f)}</span>
        <span className="log-time" title={formatDateTime(f.lastSeen)}>{timeAgo(f.lastSeen)}</span>
        <span className="log-rarity-col"><RarityChip tier={f.interestTier} score={f.interestScore} /></span>
        <span className="log-seen"><SeenBadge count={f.timesSeen} /></span>
        <span className="log-chevron-col"><Chevron open={open} /></span>
      </button>

      {open && (
        <div className="log-detail">
          <div className="log-detail-tabs" role="tablist">
            {DETAIL_TABS.map(({ key, label }) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={`log-detail-tab${tab === key ? ' active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
            <ShareCatchButton flight={f} mode="log" className="log-share-btn" />
          </div>
          <div className="log-detail-body">
            {tab === 'details'   && <DetailsTab   f={f} typeLabel={typeLabel} />}
            {tab === 'flight'    && <FlightTab    f={f} />}
            {tab === 'rarity'    && <RarityTab    f={f} />}
            {tab === 'ingestion' && <IngestionTab f={f} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Today", "Yesterday", "Monday", then "Mon, Oct 5" — a logbook's page headings. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(today) - start(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

// ── Column header ─────────────────────────────────────────────────────────────

function ListHeader() {
  return (
    <div className="log-list-header" aria-hidden="true">
      <span className="log-col-label">Callsign</span>
      <span className="log-col-label log-col-aircraft">Aircraft</span>
      <span className="log-col-label log-col-route">Route</span>
      <span className="log-col-label">Last caught</span>
      <span className="log-col-label log-col-rarity">Rarity</span>
      <span className="log-col-label log-col-right log-col-seen">Times</span>
      <span className="log-chevron-col" />
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────

type ClassFilter = 'all' | Classification;

const CLASS_PILLS: { key: ClassFilter; label: string }[] = [
  { key: 'all',        label: 'All'        },
  { key: 'commercial', label: 'Airline'    },
  { key: 'private',    label: 'Private'    },
  { key: 'cargo',      label: 'Cargo'      },
  { key: 'government', label: 'Government' },
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
  // Phones get search plus a Filters button; desktop always shows the panel.
  const [open, setOpen] = useState(false);
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

  const activeFilters = (isApplied ? 1 : 0) + (classFilter !== 'all' ? 1 : 0);

  return (
    <div className={`log-filter-bar${open ? ' open' : ''}`}>
      <div className="log-filter-row log-filter-search">
        <div className="log-search-wrap">
          <svg viewBox="0 0 16 16" className="log-search-icon" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            className="log-search"
            type="search"
            placeholder="Search callsign, registration, airline, airport"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            spellCheck={false}
            aria-label="Search your log"
          />
        </div>
        <button
          type="button"
          className={`log-filter-toggle${activeFilters ? ' has-active' : ''}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          Filters{activeFilters ? <span className="log-filter-badge">{activeFilters}</span> : null}
        </button>
      </div>

      <div className="log-filter-panel">
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
              <button className="log-date-clear" onClick={handleClear} title="Clear date filter" aria-label="Clear date filter">✕</button>
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
                {key !== 'all' && <span className={`log-dot ${key}`} />}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="log-filter-count" role="status">
        {count < total ? `Showing ${count} of ${total.toLocaleString()}` : `${total.toLocaleString()} aircraft`}
      </p>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

const LIMIT_OPTIONS = [50, 100, 200] as const;

interface LogData {
  flights: Flight[];
  total: number;
}

export default function LogScreen() {
  const [limit,       setLimit      ] = useState<50 | 100 | 200>(50);
  const [search,      setSearch     ] = useState('');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  // Only ISO strings committed by Apply/preset — never changes on raw input
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo,   setAppliedTo  ] = useState('');

  // Stale-while-revalidate: paint the last known page instantly (keyed by the
  // query), then refresh in the background. The key comparison during render
  // replaces the old "reset loading in an effect" pattern.
  const queryKey = `log:${limit}:${appliedFrom}:${appliedTo}`;
  const [result, setResult] = useState<{ key: string; data: LogData | null; failed: boolean }>(
    () => ({ key: queryKey, data: readCache<LogData>(queryKey), failed: false }),
  );
  if (result.key !== queryKey) {
    setResult({ key: queryKey, data: readCache<LogData>(queryKey), failed: false });
  }

  useEffect(() => {
    let cancelled = false;
    fetchLog(limit, 0, appliedFrom || undefined, appliedTo || undefined)
      .then((data) => {
        if (cancelled) return;
        writeCache(queryKey, data);
        setResult({ key: queryKey, data, failed: false });
      })
      .catch(() => {
        if (cancelled) return;
        // A failed refresh keeps showing cached data; only report the error
        // when there's nothing to show at all.
        setResult((r) => (r.key === queryKey ? { ...r, failed: true } : r));
      });
    return () => { cancelled = true; };
  }, [queryKey, limit, appliedFrom, appliedTo]);

  const flights = useMemo(() => result.data?.flights ?? [], [result.data]);
  const total   = result.data?.total ?? 0;
  const loading = !result.data && !result.failed;
  const error   = result.failed && !result.data ? "Couldn't load your log. Check your connection and open it again." : null;

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

  // Group by the day each plane was last caught, in list order.
  const groups = useMemo(() => {
    const out: { label: string; items: Flight[] }[] = [];
    for (const f of filtered) {
      const label = dayLabel(f.lastSeen);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(f);
      else out.push({ label, items: [f] });
    }
    return out;
  }, [filtered]);

  return (
    <div className="log-screen">
      <header className="screen-head log-header">
        <div>
          <h1 className="screen-title">Your log</h1>
          <p className="screen-lede">Every plane you've caught, newest first. Tap one for its photo and story.</p>
        </div>
        <label className="log-header-right">
          <span className="log-limit-label">Show</span>
          <select
            className="log-limit-select"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) as 50 | 100 | 200)}
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>Last {n}</option>
            ))}
          </select>
        </label>
      </header>

      {!loading && (
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
        {loading && <div className="log-empty">Opening your log…</div>}
        {!loading && error && <div className="log-empty log-error">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="log-empty">
            {flights.length === 0
              ? 'Nothing caught yet. Open Overhead next time you hear a plane — it lands here.'
              : 'Nothing matches. Try a different search or clear the filters.'}
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <>
            <ListHeader />
            {groups.map(({ label, items }, i) => (
              <section key={`${label}-${i}`} className="log-day" aria-label={label}>
                <h2 className="log-day-label">
                  {label}
                  <span className="log-day-count">{items.length}</span>
                </h2>
                {items.map((f) => (
                  <LogRow key={`${f.hex}-${f.firstSeen}`} flight={f} />
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
