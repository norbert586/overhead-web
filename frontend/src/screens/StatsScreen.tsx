import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
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

// ── Notable / Most-seen expandable rows ───────────────────────────────────────

function NotableRow({ f }: { f: Flight }) {
  const [open, setOpen] = useState(false);
  const type = [f.manufacturer, f.aircraftType].filter(Boolean).join(' ') || '—';

  return (
    <div className={`s-exp-row${open ? ' open' : ''}`}>
      <button className="s-exp-main" onClick={() => setOpen(o => !o)}>
        <span className={`log-dot ${f.classification}`} style={{ flexShrink: 0 }} />
        <span className="s-exp-callsign">{f.callsign ?? f.registration ?? f.hex}</span>
        <span className="s-exp-type">{type}</span>
        <span className="s-exp-route">
          {f.originIata && f.destinationIata ? `${f.originIata} → ${f.destinationIata}` : '—'}
        </span>
        <span className="s-exp-time">{timeAgo(f.lastSeen)}</span>
        <svg viewBox="0 0 12 12" className={`log-chevron${open ? ' open' : ''}`} aria-hidden>
          <polyline points="2,4 6,8 10,4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="s-exp-detail">
          {[
            ['Registration', f.registration], ['Hex', f.hex],
            ['Operator', f.operator], ['Owner', f.owner],
            ['Country', f.country], ['Alt', fmtAlt(f.altitudeFt)],
            ['Speed', f.speedKts != null ? `${f.speedKts} kts` : null],
            ['Times seen', String(f.timesSeen)],
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
        <SCard title="Recent Notable Activity">
          {notable.loading ? <SCardLoading /> : notable.error ? <SCardError /> : (
            <div className="s-exp-list">
              <div className="s-exp-header">
                <span />
                <span />
                <span className="s-col-label">Callsign</span>
                <span className="s-col-label">Type</span>
                <span className="s-col-label">Route</span>
                <span className="s-col-label">Seen</span>
                <span />
              </div>
              {notable.data!.recentNotable.length === 0
                ? <div className="s-empty">No notable activity yet</div>
                : notable.data!.recentNotable.map((f) => (
                  <NotableRow key={`${f.hex}-${f.firstSeen}`} f={f} />
                ))}
            </div>
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
