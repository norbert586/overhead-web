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
import { readCache, writeCache } from '../utils/swrCache';
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
  commercial: 'var(--class-commercial)',
  private:    'var(--class-private)',
  cargo:      'var(--class-cargo)',
  government: 'var(--class-government)',
  military:   'var(--class-government)',
  unknown:    'var(--class-unknown)',
};

// ── Per-section state ─────────────────────────────────────────────────────────
// Each section paints instantly from its cached copy (stale-while-revalidate)
// and refreshes in the background. A failed refresh keeps showing cached data.

type S<T> = { data: T | null; loading: boolean; error: boolean };
const init = <T,>(key: string) => (): S<T> => {
  const cached = readCache<T>(key);
  return { data: cached, loading: !cached, error: false };
};

function loadSection<T>(
  key: string,
  fetcher: () => Promise<T>,
  setter: Dispatch<SetStateAction<S<T>>>,
): Promise<void> {
  return fetcher()
    .then((data) => {
      writeCache(key, data);
      setter({ data, loading: false, error: false });
    })
    .catch(() => setter((s) => ({ data: s.data, loading: false, error: !s.data })));
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
      <h2 className="s-card-title">{title}</h2>
      {children}
    </div>
  );
}

function SCardError({ message = "Couldn't load this. Refresh to try again." }: { message?: string }) {
  return <div className="s-section-error">{message}</div>;
}

function SCardLoading() {
  return <div className="s-section-loading" aria-label="Loading" />;
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
  commercial: 'Airline',
  private:    'Private',
  cargo:      'Cargo',
  government: 'Government',
  military:   'Military',
  unknown:    'Unknown',
};

const TIER_LABEL: Record<string, string> = {
  rare:         'Rare',
  interesting:  'Interesting',
  noteworthy:   'Noteworthy',
  routine:      'Routine',
};

// Emergency squawks the carrier marks with a distinct red banner.
const EMERGENCY_SQUAWKS = new Set(['7500', '7600', '7700', '7777']);

function emergencyLabel(f: Flight): string | null {
  if (f.squawk && EMERGENCY_SQUAWKS.has(f.squawk)) {
    if (f.squawk === '7500') return 'Hijack code (squawk 7500)';
    if (f.squawk === '7600') return 'Lost radio (squawk 7600)';
    if (f.squawk === '7700') return 'Emergency (squawk 7700)';
    return 'Military intercept (squawk 7777)';
  }
  if (f.emergency && f.emergency !== 'none') {
    return `Emergency: ${f.emergency}`;
  }
  return null;
}

function NotableCard({ f }: { f: Flight }) {
  const ident = f.callsign ?? f.registration ?? f.hex;
  const type  = [f.manufacturer, f.aircraftType].filter(Boolean).join(' ') || null;
  const route = f.originIata && f.destinationIata
    ? `${f.originIata} → ${f.destinationIata}` : null;
  const flag  = f.country ? countryToFlag(f.country) : null;
  const tier  = f.interestTier ?? 'routine';
  const emergency = emergencyLabel(f);

  return (
    <div className={`nc-card nc-card--${f.classification} nc-tier--${tier}${emergency ? ' nc-card--emergency' : ''}`}>
      {/* Emergency banner takes top billing when present */}
      {emergency && (
        <div className="nc-emergency-banner" role="alert">
          <span className="nc-emergency-pulse" aria-hidden />
          {emergency}
        </div>
      )}

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
          <span className="nc-last-seen">
            <span className="nc-last-seen-label">Last seen</span>
            <span className="nc-last-seen-time" title={new Date(f.lastSeen).toLocaleString()}>
              {timeAgo(f.lastSeen)}
            </span>
          </span>
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
    return <div className="s-empty">No rare catches yet — they'll land here when you snag one</div>;
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
            ['Times caught', fmt(a.maxTimesSeen)],
            ['First caught', timeAgo(a.firstSeenEver)],
            ['Last caught', timeAgo(a.lastSeenEver)],
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
  const [summary,       setSummary      ] = useState<S<StatsSummaryData>>(init('stats:summary'));
  const [altitude,      setAltitude     ] = useState<S<StatsAltitudeData>>(init('stats:altitude'));
  const [activity,      setActivity     ] = useState<S<StatsActivityData>>(init('stats:activity'));
  const [aircraftTypes, setAircraftTypes] = useState<S<StatsAircraftTypesData>>(init('stats:aircraft-types'));
  const [operators,     setOperators    ] = useState<S<StatsOperatorsData>>(init('stats:operators'));
  const [countries,     setCountries    ] = useState<S<StatsCountriesData>>(init('stats:countries'));
  const [routes,        setRoutes       ] = useState<S<StatsRoutesData>>(init('stats:routes'));
  const [notable,       setNotable      ] = useState<S<StatsNotableData>>(init('stats:notable'));
  const [mostSeen,      setMostSeen     ] = useState<S<StatsMostSeenData>>(init('stats:most-seen'));
  const [updated,       setUpdated      ] = useState<Date | null>(null);

  const load = useCallback(() => {
    const sections = [
      loadSection('stats:summary',        fetchStatsSummary,       setSummary),
      loadSection('stats:altitude',       fetchStatsAltitude,      setAltitude),
      loadSection('stats:activity',       fetchStatsActivity,      setActivity),
      loadSection('stats:aircraft-types', fetchStatsAircraftTypes, setAircraftTypes),
      loadSection('stats:operators',      fetchStatsOperators,     setOperators),
      loadSection('stats:countries',      fetchStatsCountries,     setCountries),
      loadSection('stats:routes',         fetchStatsRoutes,        setRoutes),
      loadSection('stats:notable',        fetchStatsNotable,       setNotable),
      loadSection('stats:most-seen',      fetchStatsMostSeen,      setMostSeen),
    ];
    Promise.allSettled(sections).then(() => setUpdated(new Date()));
  }, []);

  useEffect(() => { load(); }, [load]);

  const anyLoading = [summary, altitude, activity, aircraftTypes, operators, countries, routes, notable, mostSeen]
    .some((s) => s.loading);

  const hourlyFull = activity.data ? fillHours(activity.data.hourlyActivity) : [];
  const weeklyFull = activity.data ? fillWeek(activity.data.weeklyActivity)  : [];

  const maxType    = aircraftTypes.data ? Math.max(...aircraftTypes.data.topAircraftTypes.map((t) => t.eventCount), 1) : 1;
  const maxOp      = operators.data    ? Math.max(...operators.data.topOperators.map((o) => o.eventCount), 1) : 1;
  const maxCountry = countries.data    ? Math.max(...countries.data.topCountries.map((c) => c.eventCount), 1) : 1;
  const maxRoute   = routes.data       ? Math.max(...routes.data.topRoutes.map((r) => r.eventCount), 1) : 1;
  const maxAlt     = altitude.data     ? Math.max(...altitude.data.altitudeDistribution.map((a) => a.count), 1) : 1;

  const AXIS_STYLE = {
    tick:     { fill: 'var(--text-dim)', fontSize: 11, fontFamily: "'B612', sans-serif" },
    axisLine: false as const,
    tickLine: false as const,
  };

  return (
    <div className="stats-screen">
      <header className="screen-head stats-header">
        <div>
          <h1 className="screen-title">Your stats</h1>
          <p className="screen-lede">
            {updated ? `Updated ${updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Adding up your catches…'}
          </p>
        </div>
        <button className="stats-refresh-btn" onClick={load} disabled={anyLoading}>
          <svg viewBox="0 0 16 16" aria-hidden="true" className={anyLoading ? 'spinning' : ''}>
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {anyLoading ? 'Refreshing' : 'Refresh'}
        </button>
      </header>

      {/* Logbook totals: the numbers you'd write at the bottom of the page. */}
      <section className="stats-totals" aria-label="Totals">
        {summary.loading ? <SCardLoading /> : summary.error ? <SCardError /> : (
          <>
            <div className="stats-total stats-total--lead">
              <span className="stats-total-value">{fmt(summary.data!.summary.totalCatches)}</span>
              <span className="stats-total-label">catches, all time</span>
            </div>
            {[
              [fmt(summary.data!.summary.uniqueAircraft), 'different aircraft'],
              [fmt(summary.data!.summary.operators), 'airlines and operators'],
              [fmt(summary.data!.summary.countries), summary.data!.summary.countries === 1 ? 'country of registration' : 'countries of registration'],
              [summary.data!.summary.streakDays > 0 ? fmt(summary.data!.summary.streakDays) : '0', 'day streak'],
              [fmt(summary.data!.summary.catchDays), summary.data!.summary.catchDays === 1 ? 'day out spotting' : 'days out spotting'],
            ].map(([v, l]) => (
              <div className="stats-total" key={l}>
                <span className="stats-total-value">{v}</span>
                <span className="stats-total-label">{l}</span>
              </div>
            ))}
            <p className="stats-today">
              Last 24 hours: <strong>{fmt(summary.data!.summary24h.catches)}</strong> caught,{' '}
              <strong>{fmt(summary.data!.summary24h.aircraft)}</strong> different aircraft,{' '}
              <strong>{fmt(summary.data!.summary24h.operators)}</strong> operators
              {summary.data!.summary24h.govCount > 0 && (
                <>, including <strong className="stats-today-gov">{fmt(summary.data!.summary24h.govCount)}</strong> government or military</>
              )}.
            </p>
          </>
        )}
      </section>

      <div className="stats-grid">

        {/* ── Classification breakdown ── */}
        <SCard title="What you catch" className="s-full">
          {summary.loading ? <SCardLoading /> : summary.error ? <SCardError /> : (
            <>
              <div className="s-chart-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.data!.classification.map((c) => ({
                    name: CLASS_LABEL[c.classification] ?? c.classification, total: c.totalCount, h24: c.count24h,
                  }))} barGap={4} barSize={28}>
                    <XAxis dataKey="name" {...AXIS_STYLE} />
                    <YAxis {...AXIS_STYLE} width={36} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--ink-rgb) / 0.05)' }} />
                    <Bar dataKey="total" name="All time" radius={[4, 4, 0, 0]}>
                      {summary.data!.classification.map((c) => (
                        <Cell key={c.classification} fill={CLASS_COLORS[c.classification] ?? 'var(--class-unknown)'} fillOpacity={0.75} />
                      ))}
                    </Bar>
                    <Bar dataKey="h24" name="Last 24h" radius={[4, 4, 0, 0]}>
                      {summary.data!.classification.map((c) => (
                        <Cell key={c.classification} fill={CLASS_COLORS[c.classification] ?? 'var(--class-unknown)'} />
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
        <SCard title="How high they fly">
          {altitude.loading ? <SCardLoading /> : altitude.error ? <SCardError /> : (
            <div className="s-bar-list">
              {altitude.data!.altitudeDistribution.map((a) => (
                <BarRow key={a.band} label={a.band} value={a.count} max={maxAlt} />
              ))}
            </div>
          )}
        </SCard>

        {/* ── Hourly activity ── */}
        <SCard title="Time of day, last 24 hours">
          {activity.loading ? <SCardLoading /> : activity.error ? <SCardError /> : (
            <div className="s-chart-sm">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyFull} barSize={8}>
                  <XAxis dataKey="label" {...AXIS_STYLE} interval={3} />
                  <YAxis {...AXIS_STYLE} width={28} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--ink-rgb) / 0.05)' }} />
                  <Bar dataKey="events" fill="var(--accent)" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SCard>

        {/* ── Weekly breakdown ── */}
        <SCard title="The last 7 days" className="s-full">
          {activity.loading ? <SCardLoading /> : activity.error ? <SCardError /> : (
            <div className="s-chart-md">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyFull} barSize={36}>
                  <XAxis dataKey="label" {...AXIS_STYLE} />
                  <YAxis {...AXIS_STYLE} width={36} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--ink-rgb) / 0.05)' }} />
                  <Bar dataKey="events" fill="var(--accent)" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SCard>

        {/* ── Most common aircraft types ── */}
        <SCard title="Most common aircraft">
          {aircraftTypes.loading ? <SCardLoading /> : aircraftTypes.error ? <SCardError /> : (
            <div className="s-bar-list">
              {aircraftTypes.data!.topAircraftTypes.map((t) => (
                <BarRow
                  key={t.aircraftType}
                  label={t.manufacturer ? `${t.manufacturer} ${t.aircraftType}` : t.aircraftType}
                  value={t.eventCount}
                  max={maxType}
                />
              ))}
            </div>
          )}
        </SCard>

        {/* ── Rarest catches ── */}
        <SCard title="Rarest catches" className="s-notable">
          {notable.loading ? <SCardLoading /> : notable.error ? <SCardError /> : (
            <NotableCarousel flights={notable.data!.recentNotable} />
          )}
        </SCard>

        {/* ── Most caught aircraft ── */}
        <SCard title="Your regulars" className="s-full">
          {mostSeen.loading ? <SCardLoading /> : mostSeen.error ? <SCardError /> : (
            <div className="s-exp-list">
              <div className="s-exp-header s-exp-header-seen">
                <span className="s-col-label">#</span>
                <span />
                <span className="s-col-label">Registration</span>
                <span className="s-col-label">Type</span>
                <span className="s-col-label">Operator</span>
                <span className="s-col-label s-col-right">Times</span>
                <span />
              </div>
              {mostSeen.data!.mostSeenAircraft.map((a, i) => (
                <MostSeenRow key={a.hex} a={a} rank={i + 1} />
              ))}
            </div>
          )}
        </SCard>

        {/* ── Top operators ── */}
        <SCard title="Top airlines and operators">
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
        <SCard title="Where they’re registered">
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
        <SCard title="Routes over you">
          {routes.loading ? <SCardLoading /> : routes.error ? <SCardError /> : (
            <div className="s-route-list">
              {routes.data!.topRoutes.length === 0
                ? <div className="s-empty">No routes yet — many flights don't broadcast one.</div>
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
