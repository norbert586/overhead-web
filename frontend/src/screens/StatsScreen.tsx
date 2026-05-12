import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  type TooltipProps,
} from 'recharts';
import {
  fetchStatsSummary,
  fetchStatsAltitude,
  fetchStatsActivity,
  fetchStatsAircraftTypes,
  fetchStatsOperators,
  fetchStatsCountries,
  fetchStatsRoutes,
  fetchStatsNotable,
  fetchStatsMostSeen,
} from '../services/api';
import { getAirlineIata, getAirlineLogoUrl } from '../utils/airlines';
import { countryToFlag } from '../utils/formatting';
import type {
  StatsSummaryData,
  StatsAltitudeData,
  StatsActivityData,
  StatsAircraftTypesData,
  StatsOperatorsData,
  StatsCountriesData,
  StatsRoutesData,
  StatsNotableData,
  StatsMostSeenData,
} from '../types/stats';
import type { Flight } from '../types/flight';

// ── Constants ─────────────────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  commercial: '#5b9bd5',
  private:    '#9b7ec8',
  cargo:      '#c4935a',
  government: '#d46b6b',
  military:   '#d46b6b',
  unknown:    '#5a6370',
};

const THREAT_LEVELS = [
  { max: 2,        label: 'CLEAR',    color: '#4a9b6f' },
  { max: 6,        label: 'LOW',      color: '#c4935a' },
  { max: 12,       label: 'ELEVATED', color: '#d4864a' },
  { max: Infinity, label: 'HIGH',     color: '#d46b6b' },
];

function getThreatLevel(govCount: number) {
  return THREAT_LEVELS.find((l) => govCount <= l.max) ?? THREAT_LEVELS[3];
}

// ── Per-section state ─────────────────────────────────────────────────────────

type S<T> = { data: T | null; loading: boolean; error: boolean };
const init = <T,>(): S<T> => ({ data: null, loading: true, error: false });

function loadSection<T>(
  fetcher: () => Promise<T>,
  setter: Dispatch<SetStateAction<S<T>>>,
) {
  setter({ data: null, loading: true, error: false });
  fetcher()
    .then((data) => setter({ data, loading: false, error: false }))
    .catch(() => setter({ data: null, loading: false, error: true }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtAlt(ft: number | null): string {
  if (ft == null) return '—';
  return `${Math.round(ft / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ft';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fillHours(data: StatsActivityData['hourlyActivity']) {
  return Array.from({ length: 24 }, (_, i) => ({
    label: `${String(i).padStart(2, '0')}`,
    events: data.find((h) => h.hour === i)?.events ?? 0,
  }));
}

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NUM   = [1, 2, 3, 4, 5, 6, 0];
function fillWeek(data: StatsActivityData['weeklyActivity']) {
  return DAY_ORDER.map((name, i) => ({
    label:  name,
    events: data.find((d) => d.dayNum === DAY_NUM[i])?.events ?? 0,
  }));
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: TooltipProps<number, string> & { payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <span className="chart-tooltip-label">{label}</span>
      <span className="chart-tooltip-value">{payload[0].value}</span>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SCard({ title, className = '', children }: {
  title: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`s-card ${className}`}>
      <div className="s-card-title">{title}</div>
      {children}
    </div>
  );
}

function SCardError({ message = 'Failed to load' }: { message?: string }) {
  return <div className="s-section-error">{message}</div>;
}

function SCardLoading() {
  return <div className="s-section-loading">Loading…</div>;
}

function BarRow({ label, value, max, color = 'var(--accent)' }: {
  label: string; value: number; max: number; color?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="s-bar-row">
      <span className="s-bar-label">{label}</span>
      <div className="s-bar-track">
        <div className="s-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="s-bar-value">{fmt(value)}</span>
    </div>
  );
}

// ── Route row (expandable) ────────────────────────────────────────────────────

function RouteRow({ r, max }: {
  r: StatsRoutesData['topRoutes'][0]; max: number;
}) {
  const [open, setOpen] = useState(false);
  const pct = max > 0 ? Math.round((r.eventCount / max) * 100) : 0;

  return (
    <div className={`s-route-row${open ? ' open' : ''}`}>
      <button className="s-route-main" onClick={() => setOpen(o => !o)}>
        <span className="s-route-label">{r.originIata} → {r.destinationIata}</span>
        <div className="s-bar-track">
          <div className="s-bar-fill" style={{ width: `${pct}%`, background: 'var(--class-commercial)' }} />
        </div>
        <span className="s-bar-value">{fmt(r.eventCount)}</span>
        <svg viewBox="0 0 12 12" className={`log-chevron${open ? ' open' : ''}`} aria-hidden>
          <polyline points="2,4 6,8 10,4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="s-route-detail">
          <div className="s-route-airport">
            <div className="s-route-airport-tag">Origin</div>
            <div className="s-route-iata">{r.originIata}</div>
            {r.originCity && <div className="s-route-city">{r.originCity}</div>}
          </div>
          <div className="s-route-connector" aria-hidden>→</div>
          <div className="s-route-airport">
            <div className="s-route-airport-tag">Destination</div>
            <div className="s-route-iata">{r.destinationIata}</div>
            {r.destinationCity && <div className="s-route-city">{r.destinationCity}</div>}
          </div>
          <div className="s-route-count-block">
            <div className="s-route-airport-tag">Flights</div>
            <div className="s-route-count">{fmt(r.eventCount)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Operator logo ─────────────────────────────────────────────────────────────

function OperatorLogo({ name }: { name: string }) {
  const iata = getAirlineIata(name);
  const [ok, setOk] = useState(!!iata);

  if (!iata || !ok) {
    return (
      <div className="s-op-initials">
        {name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
      </div>
    );
  }

  return (
    <img
      className="s-op-logo"
      src={getAirlineLogoUrl(iata)}
      alt={name}
      onError={() => setOk(false)}
    />
  );
}

// ── Notable aircraft — swipable card carousel ─────────────────────────────────

const CLASS_LABEL: Record<string, string> = {
  commercial: 'Commercial',
  private:    'Private',
  cargo:      'Cargo',
  government: 'Government',
  military:   'Military',
  unknown:    'Unknown',
};

const TIER_LABEL: Record<string, string> = {
  rare:         'RARE',
  interesting:  'INTERESTING',
  noteworthy:   'NOTEWORTHY',
  routine:      'ROUTINE',
};

function NotableCard({ f }: { f: Flight }) {
  const ident = f.callsign ?? f.registration ?? f.hex;
  const type  = [f.manufacturer, f.aircraftType].filter(Boolean).join(' ') || null;
  const route = f.originIata && f.destinationIata
    ? `${f.originIata} → ${f.destinationIata}` : null;
  const flag  = f.country ? countryToFlag(f.country) : null;
  const tier  = f.interestTier ?? 'routine';

  return (
    <div className={`nc-card nc-card--${f.classification} nc-tier--${tier}`}>
      {/* Interest tier + score (replaces the old classification-only badge as the headline) */}
      <div className={`nc-tier nc-tier-badge--${tier}`}>
        <span className="nc-tier-label">{TIER_LABEL[tier] ?? tier}</span>
        <span className="nc-tier-score">{f.interestScore}</span>
      </div>

      {/* Secondary classification chip */}
      <div className={`nc-badge nc-badge--${f.classification}`}>
        <span className={`log-dot ${f.classification}`} />
        {CLASS_LABEL[f.classification] ?? f.classification}
      </div>

      {/* Primary identifier */}
      <div className="nc-ident">{ident}</div>

      {/* Aircraft type */}
      {type && <div className="nc-type">{type}</div>}

      {/* Why it's interesting — top reasons from the scoring engine */}
      {f.interestReasons && f.interestReasons.length > 0 && (
        <ul className="nc-reasons">
          {f.interestReasons.slice(0, 3).map((r) => (
            <li key={r} className="nc-reason">{r}</li>
          ))}
        </ul>
      )}

      {/* Country + operator */}
      <div className="nc-intel">
        {(flag || f.country) && (
          <div className="nc-country">
            {flag && <span className="nc-flag">{flag}</span>}
            {f.country && <span className="nc-country-name">{f.country}</span>}
          </div>
        )}
        {f.operator && <div className="nc-operator">{f.operator}</div>}
        {!f.operator && f.owner && <div className="nc-operator">{f.owner}</div>}
      </div>

      {/* Route */}
      {route && (
        <div className="nc-route">
          <span className="nc-route-origin">{f.originIata}</span>
          <span className="nc-route-arrow">→</span>
          <span className="nc-route-dest">{f.destinationIata}</span>
          {f.originCity && f.destinationCity && (
            <div className="nc-route-cities">
              {f.originCity} → {f.destinationCity}
            </div>
          )}
        </div>
      )}

      {/* Footer: telemetry + seen counter */}
      <div className="nc-footer">
        <div className="nc-telem">
          {f.altitudeFt != null && <span>{fmtAlt(f.altitudeFt)}</span>}
          {f.speedKts   != null && <span>{f.speedKts} kts</span>}
          {f.squawk && <span className="nc-squawk">sq {f.squawk}</span>}
        </div>
        <div className="nc-seen-wrap">
          <span className="nc-seen">×{f.timesSeen}</span>
          <span className="nc-time">{timeAgo(f.lastSeen)}</span>
        </div>
      </div>
    </div>
  );
}

function NotableCarousel({ flights }: { flights: Flight[] }) {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.children.length === 0) return;
    const cardW = (el.children[0] as HTMLElement).offsetWidth + 10; // 10px gap
    setIdx(Math.min(Math.round(el.scrollLeft / cardW), flights.length - 1));
  }, [flights.length]);

  function scrollTo(i: number) {
    const el = scrollRef.current;
    if (!el || el.children.length === 0) return;
    const cardW = (el.children[0] as HTMLElement).offsetWidth + 10;
    el.scrollTo({ left: cardW * i, behavior: 'smooth' });
  }

  if (flights.length === 0) {
    return <div className="s-empty">No notable activity yet</div>;
  }

  return (
    <div className="nc-wrap">
      <div
        className="nc-carousel"
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {flights.map((f) => (
          <NotableCard key={`${f.hex}-${f.firstSeen}`} f={f} />
        ))}
      </div>

      {flights.length > 1 && (
        <div className="nc-dots">
          {flights.map((_, i) => (
            <button
              key={i}
              className={`nc-dot${i === idx ? ' active' : ''}`}
              onClick={() => scrollTo(i)}
              aria-label={`Go to card ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MostSeenRow({ a, rank }: {
  a: StatsMostSeenData['mostSeenAircraft'][0]; rank: number;
}) {
  const [open, setOpen] = useState(false);
  const type = [a.manufacturer, a.aircraftType].filter(Boolean).join(' ') || '—';

  return (
    <div className={`s-exp-row${open ? ' open' : ''}`}>
      <button className="s-exp-main s-exp-main-seen" onClick={() => setOpen(o => !o)}>
        <span className="s-rank">#{rank}</span>
        <span className={`log-dot ${a.classification}`} style={{ flexShrink: 0 }} />
        <span className="s-exp-callsign">{a.registration ?? a.callsign ?? a.hex}</span>
        <span className="s-exp-type">{type}</span>
        <span className="s-exp-operator">{a.operator ?? '—'}</span>
        <span className="s-exp-seen">{fmt(a.maxTimesSeen)}×</span>
        <svg viewBox="0 0 12 12" className={`log-chevron${open ? ' open' : ''}`} aria-hidden>
          <polyline points="2,4 6,8 10,4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="s-exp-detail">
          {[
            ['Hex', a.hex], ['Registration', a.registration],
            ['Callsign', a.callsign], ['Aircraft', type !== '—' ? type : null],
            ['Operator', a.operator], ['Country', a.country],
            ['Times seen', fmt(a.maxTimesSeen)],
            ['Events in DB', fmt(a.eventCount)],
            ['First seen', timeAgo(a.firstSeenEver)],
            ['Last seen', timeAgo(a.lastSeenEver)],
          ].filter(([, v]) => v).map(([l, v]) => (
            <div className="s-exp-detail-row" key={String(l)}>
              <span className="log-detail-label">{l}</span>
              <span className="log-detail-value">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const [summary,       setSummary      ] = useState<S<StatsSummaryData>>(init);
  const [altitude,      setAltitude     ] = useState<S<StatsAltitudeData>>(init);
  const [activity,      setActivity     ] = useState<S<StatsActivityData>>(init);
  const [aircraftTypes, setAircraftTypes] = useState<S<StatsAircraftTypesData>>(init);
  const [operators,     setOperators    ] = useState<S<StatsOperatorsData>>(init);
  const [countries,     setCountries    ] = useState<S<StatsCountriesData>>(init);
  const [routes,        setRoutes       ] = useState<S<StatsRoutesData>>(init);
  const [notable,       setNotable      ] = useState<S<StatsNotableData>>(init);
  const [mostSeen,      setMostSeen     ] = useState<S<StatsMostSeenData>>(init);
  const [updated,       setUpdated      ] = useState<Date | null>(null);

  function load() {
    loadSection(fetchStatsSummary,       setSummary);
    loadSection(fetchStatsAltitude,      setAltitude);
    loadSection(fetchStatsActivity,      setActivity);
    loadSection(fetchStatsAircraftTypes, setAircraftTypes);
    loadSection(fetchStatsOperators,     setOperators);
    loadSection(fetchStatsCountries,     setCountries);
    loadSection(fetchStatsRoutes,        setRoutes);
    loadSection(fetchStatsNotable,       setNotable);
    loadSection(fetchStatsMostSeen,      setMostSeen);
    setUpdated(new Date());
  }

  useEffect(() => { load(); }, []);

  const anyLoading = [summary, altitude, activity, aircraftTypes, operators, countries, routes, notable, mostSeen]
    .some((s) => s.loading);

  const threat     = summary.data ? getThreatLevel(summary.data.summary24h.govCount) : null;
  const hourlyFull = activity.data ? fillHours(activity.data.hourlyActivity) : [];
  const weeklyFull = activity.data ? fillWeek(activity.data.weeklyActivity)  : [];

  const maxType    = aircraftTypes.data ? Math.max(...aircraftTypes.data.topAircraftTypes.map((t) => t.eventCount), 1) : 1;
  const maxOp      = operators.data    ? Math.max(...operators.data.topOperators.map((o) => o.eventCount), 1) : 1;
  const maxCountry = countries.data    ? Math.max(...countries.data.topCountries.map((c) => c.eventCount), 1) : 1;
  const maxRoute   = routes.data       ? Math.max(...routes.data.topRoutes.map((r) => r.eventCount), 1) : 1;
  const maxAlt     = altitude.data     ? Math.max(...altitude.data.altitudeDistribution.map((a) => a.count), 1) : 1;

  const AXIS_STYLE = {
    tick:     { fill: '#55667a', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" },
    axisLine: false as const,
    tickLine: false as const,
  };

  return (
    <div className="stats-screen">
      {/* ── Header ── */}
      <div className="stats-header">
        <span className="stats-title">Statistics</span>
        {updated && (
          <span className="stats-updated">Updated {updated.toLocaleTimeString()}</span>
        )}
        <button className="stats-refresh-btn" onClick={load} disabled={anyLoading}>
          {anyLoading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      <div className="stats-grid">

        {/* ── Threat level ── */}
        <SCard title="Threat Level" className="s-threat">
          {summary.loading ? <SCardLoading /> : summary.error ? <SCardError /> : (
            <div className="s-threat-body">
              <div className="s-threat-level" style={{ color: threat!.color }}>
                {threat!.label}
              </div>
              <div className="s-threat-count" style={{ color: threat!.color }}>
                {fmt(summary.data!.summary24h.govCount)}
              </div>
              <div className="s-threat-sub">gov / mil aircraft in last 24h</div>
            </div>
          )}
        </SCard>

        {/* ── 24h snapshot ── */}
        <SCard title="Last 24 Hours">
          {summary.loading ? <SCardLoading /> : summary.error ? <SCardError /> : (
            [
              ['Events',    fmt(summary.data!.summary24h.events)],
              ['Aircraft',  fmt(summary.data!.summary24h.aircraft)],
              ['Operators', fmt(summary.data!.summary24h.operators)],
            ].map(([l, v]) => (
              <div className="s-stat-row" key={l}>
                <span className="s-stat-label">{l}</span>
                <span className="s-stat-value">{v}</span>
              </div>
            ))
          )}
        </SCard>

        {/* ── All-time snapshot ── */}
        <SCard title="All Time">
          {summary.loading ? <SCardLoading /> : summary.error ? <SCardError /> : (
            [
              ['Total events',    fmt(summary.data!.summary.totalEvents)],
              ['Unique aircraft', fmt(summary.data!.summary.uniqueAircraft)],
              ['Operators',       fmt(summary.data!.summary.operators)],
              ['Countries',       fmt(summary.data!.summary.countries)],
              ['Avg altitude',    fmtAlt(summary.data!.summary.avgAltitudeFt)],
            ].map(([l, v]) => (
              <div className="s-stat-row" key={l}>
                <span className="s-stat-label">{l}</span>
                <span className="s-stat-value">{v}</span>
              </div>
            ))
          )}
        </SCard>

        {/* ── Classification breakdown ── */}
        <SCard title="Classification Breakdown" className="s-full">
          {summary.loading ? <SCardLoading /> : summary.error ? <SCardError /> : (
            <>
              <div className="s-chart-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.data!.classification.map((c) => ({
                    name: c.classification, total: c.totalCount, h24: c.count24h,
                  }))} barGap={4} barSize={28}>
                    <XAxis dataKey="name" {...AXIS_STYLE} />
                    <YAxis {...AXIS_STYLE} width={36} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="total" name="All time" radius={[2, 2, 0, 0]}>
                      {summary.data!.classification.map((c) => (
                        <Cell key={c.classification} fill={CLASS_COLORS[c.classification] ?? '#5a6370'} fillOpacity={0.75} />
                      ))}
                    </Bar>
                    <Bar dataKey="h24" name="Last 24h" radius={[2, 2, 0, 0]}>
                      {summary.data!.classification.map((c) => (
                        <Cell key={c.classification} fill={CLASS_COLORS[c.classification] ?? '#5a6370'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="s-chart-legend">
                <span className="s-legend-item"><span className="s-legend-swatch" style={{ opacity: 0.75 }} />All time</span>
                <span className="s-legend-item"><span className="s-legend-swatch" />Last 24h</span>
              </div>
            </>
          )}
        </SCard>

        {/* ── Altitude distribution ── */}
        <SCard title="Altitude Distribution">
          {altitude.loading ? <SCardLoading /> : altitude.error ? <SCardError /> : (
            <div className="s-bar-list">
              {altitude.data!.altitudeDistribution.map((a) => (
                <BarRow key={a.band} label={a.band} value={a.count} max={maxAlt} />
              ))}
            </div>
          )}
        </SCard>

        {/* ── Hourly activity ── */}
        <SCard title="Hourly Activity (Last 24h)">
          {activity.loading ? <SCardLoading /> : activity.error ? <SCardError /> : (
            <div className="s-chart-sm">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyFull} barSize={8}>
                  <XAxis dataKey="label" {...AXIS_STYLE} interval={3} />
                  <YAxis {...AXIS_STYLE} width={28} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="events" fill="#7eb8e0" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SCard>

        {/* ── Weekly breakdown ── */}
        <SCard title="Weekly Activity (Last 7 Days)" className="s-full">
          {activity.loading ? <SCardLoading /> : activity.error ? <SCardError /> : (
            <div className="s-chart-md">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyFull} barSize={36}>
                  <XAxis dataKey="label" {...AXIS_STYLE} />
                  <YAxis {...AXIS_STYLE} width={36} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="events" fill="#7eb8e0" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SCard>

        {/* ── Most common aircraft types ── */}
        <SCard title="Most Common Aircraft Types">
          {aircraftTypes.loading ? <SCardLoading /> : aircraftTypes.error ? <SCardError /> : (
            <div className="s-bar-list">
              {aircraftTypes.data!.topAircraftTypes.map((t) => (
                <BarRow
                  key={t.aircraftType}
                  label={`${t.aircraftType}${t.manufacturer ? ` · ${t.manufacturer}` : ''}`}
                  value={t.eventCount}
                  max={maxType}
                />
              ))}
            </div>
          )}
        </SCard>

        {/* ── Recent notable ── */}
        <SCard title="Recent Notable Activity" className="s-notable">
          {notable.loading ? <SCardLoading /> : notable.error ? <SCardError /> : (
            <NotableCarousel flights={notable.data!.recentNotable} />
          )}
        </SCard>

        {/* ── Most seen aircraft ── */}
        <SCard title="Most Seen Aircraft" className="s-full">
          {mostSeen.loading ? <SCardLoading /> : mostSeen.error ? <SCardError /> : (
            <div className="s-exp-list">
              <div className="s-exp-header s-exp-header-seen">
                <span className="s-col-label">#</span>
                <span />
                <span className="s-col-label">Registration</span>
                <span className="s-col-label">Type</span>
                <span className="s-col-label">Operator</span>
                <span className="s-col-label s-col-right">Times seen</span>
                <span />
              </div>
              {mostSeen.data!.mostSeenAircraft.map((a, i) => (
                <MostSeenRow key={a.hex} a={a} rank={i + 1} />
              ))}
            </div>
          )}
        </SCard>

        {/* ── Top operators ── */}
        <SCard title="Most Active Operators">
          {operators.loading ? <SCardLoading /> : operators.error ? <SCardError /> : (
            <div className="s-op-list">
              {operators.data!.topOperators.map((o) => (
                <div className="s-op-row" key={o.operator}>
                  <OperatorLogo name={o.operator} />
                  <div className="s-op-info">
                    <span className="s-op-name">{o.operator}</span>
                    <span className="s-op-sub">{fmt(o.uniqueAircraft)} aircraft</span>
                  </div>
                  <span className="s-op-count">{fmt(o.eventCount)}</span>
                  <div className="s-bar-track" style={{ width: 60 }}>
                    <div className="s-bar-fill" style={{
                      width: `${Math.round((o.eventCount / maxOp) * 100)}%`,
                      background: CLASS_COLORS[o.topClassification] ?? 'var(--accent)',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SCard>

        {/* ── Top countries ── */}
        <SCard title="Most Common Countries">
          {countries.loading ? <SCardLoading /> : countries.error ? <SCardError /> : (
            <div className="s-bar-list">
              {countries.data!.topCountries.map((c) => (
                <BarRow
                  key={c.country}
                  label={`${c.countryIso ? countryToFlag(c.country) + ' ' : ''}${c.country}`}
                  value={c.eventCount}
                  max={maxCountry}
                />
              ))}
            </div>
          )}
        </SCard>

        {/* ── Top routes ── */}
        <SCard title="Most Common Routes">
          {routes.loading ? <SCardLoading /> : routes.error ? <SCardError /> : (
            <div className="s-route-list">
              {routes.data!.topRoutes.length === 0
                ? <div className="s-empty">No route data yet</div>
                : routes.data!.topRoutes.map((r) => (
                  <RouteRow
                    key={`${r.originIata}-${r.destinationIata}`}
                    r={r}
                    max={maxRoute}
                  />
                ))}
            </div>
          )}
        </SCard>

      </div>
    </div>
  );
}
