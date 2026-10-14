import { useState, useEffect } from 'react';
import { fetchHangar, type HangarData } from '../services/api';
import { readCache, writeCache } from '../utils/swrCache';
import { TYPE_ROSTER, ROSTER_SIZE, isOnRoster } from '../data/typeRoster';
import { SilhouetteGlyph } from '../components/AircraftSilhouette';
import { categorize } from '../utils/aircraftCategory';
import { getAirlineIata, getAirlineLogoUrl } from '../utils/airlines';
import { countryToFlag } from '../utils/formatting';

type Tab = 'aircraft' | 'airlines' | 'countries';

function fmt(n: number): string {
  return n.toLocaleString();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Type card ─────────────────────────────────────────────────────────────────

function TypeCard({ code, name, caught }: {
  code: string;
  name: string;
  caught?: HangarData['types'][0];
}) {
  return (
    <div className={`hangar-card${caught ? ' caught' : ' ghost'}`} title={caught ? undefined : `${name} — not caught yet`}>
      {caught && <SilhouetteGlyph category={categorize(code)} className="hangar-card-glyph" />}
      <div className="hangar-card-code">{code}</div>
      <div className="hangar-card-name">{name}</div>
      {caught && (
        <div className="hangar-card-meta">
          <span className="hangar-card-count">×{fmt(caught.catches)}</span>
          <span className="hangar-card-date">First {timeAgo(caught.firstCaught)}</span>
        </div>
      )}
    </div>
  );
}

// ── Airline logo (same pattern as StatsScreen) ────────────────────────────────

function AirlineLogo({ name }: { name: string }) {
  const iata = getAirlineIata(name);
  const [ok, setOk] = useState(!!iata);

  if (!iata || !ok) {
    return (
      <div className="hangar-airline-initials">
        {name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
      </div>
    );
  }
  return (
    <img
      className="hangar-airline-logo"
      src={getAirlineLogoUrl(iata)}
      alt=""
      onError={() => setOk(false)}
    />
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HangarScreen() {
  const [tab, setTab] = useState<Tab>('aircraft');
  const [data, setData] = useState<HangarData | null>(() => readCache<HangarData>('hangar'));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchHangar()
      .then((d) => {
        if (cancelled) return;
        writeCache('hangar', d);
        setData(d);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  if (!data && failed) {
    return <div className="hangar-screen"><div className="s-section-error">Couldn't open the hangar. Check your connection and try again.</div></div>;
  }
  if (!data) {
    return <div className="hangar-screen"><div className="s-section-loading" aria-label="Opening the hangar" /></div>;
  }

  const caughtByCode = new Map(data.types.map((t) => [t.aircraftType.toUpperCase(), t]));
  const rosterCaught = TYPE_ROSTER.reduce(
    (n, s) => n + s.entries.filter((e) => caughtByCode.has(e.code)).length, 0,
  );
  const offRoster = data.types.filter((t) => !isOnRoster(t.aircraftType));
  const pct = Math.round((rosterCaught / ROSTER_SIZE) * 100);

  return (
    <div className="hangar-screen">
      <header className="screen-head hangar-header">
        <div>
          <h1 className="screen-title">The hangar</h1>
          <p className="screen-lede">Every kind of aircraft you've been under. Empty slots are the ones still out there.</p>
        </div>
        {tab === 'aircraft' && (
          <div className="hangar-completion">
            <span className="hangar-completion-count">
              <strong>{rosterCaught}</strong> of {ROSTER_SIZE} types
            </span>
            <div className="hangar-completion-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Types collected">
              <div className="hangar-completion-fill" style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
          </div>
        )}
      </header>

      <div className="hangar-tabs" role="tablist">
        {([
          ['aircraft',  'Aircraft',  data.types.length],
          ['airlines',  'Airlines',  data.operators.length],
          ['countries', 'Countries', data.countries.length],
        ] as [Tab, string, number][]).map(([key, label, n]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`hangar-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            <span className="hangar-tab-count">{n}</span>
          </button>
        ))}
      </div>

      <div className="hangar-body">
        {tab === 'aircraft' && (
          <>
            {TYPE_ROSTER.map((section) => {
              const sectionCaught = section.entries.filter((e) => caughtByCode.has(e.code)).length;
              return (
                <div className="hangar-section" key={section.id}>
                  <div className="hangar-section-head">
                    <h2 className="hangar-section-label">{section.label}</h2>
                    <span className="hangar-section-count">{sectionCaught} of {section.entries.length}</span>
                    <span className="hangar-section-bar" aria-hidden="true">
                      <span style={{ width: `${(sectionCaught / section.entries.length) * 100}%` }} />
                    </span>
                  </div>
                  <div className="hangar-grid">
                    {section.entries.map((e) => (
                      <TypeCard key={e.code} code={e.code} name={e.name} caught={caughtByCode.get(e.code)} />
                    ))}
                  </div>
                </div>
              );
            })}

            {offRoster.length > 0 && (
              <div className="hangar-section">
                <div className="hangar-section-head">
                  <h2 className="hangar-section-label">Off the list</h2>
                  <span className="hangar-section-count">{offRoster.length} caught</span>
                </div>
                <div className="hangar-grid">
                  {offRoster.map((t) => (
                    <TypeCard
                      key={t.aircraftType}
                      code={t.aircraftType}
                      name={t.manufacturer ?? 'Unlisted type'}
                      caught={t}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'airlines' && (
          data.operators.length === 0
            ? <div className="hangar-empty">No airlines yet — catch a commercial flight to start this shelf.</div>
            : (
              <div className="hangar-list">
                {data.operators.map((o) => (
                  <div className="hangar-list-row" key={o.operator}>
                    <AirlineLogo name={o.operator} />
                    <div className="hangar-list-main">
                      <span className="hangar-list-name">{o.operator}</span>
                      <span className="hangar-list-sub">{fmt(o.airframes)} aircraft, first caught {timeAgo(o.firstCaught)}</span>
                    </div>
                    <span className="hangar-list-count">×{fmt(o.catches)}</span>
                  </div>
                ))}
              </div>
            )
        )}

        {tab === 'countries' && (
          data.countries.length === 0
            ? <div className="hangar-empty">No countries yet — every registry you catch plants a flag here.</div>
            : (
              <div className="hangar-list">
                {data.countries.map((c) => (
                  <div className="hangar-list-row" key={c.country}>
                    <span className="hangar-flag">{countryToFlag(c.country)}</span>
                    <div className="hangar-list-main">
                      <span className="hangar-list-name">{c.country}</span>
                      <span className="hangar-list-sub">{fmt(c.airframes)} aircraft, first caught {timeAgo(c.firstCaught)}</span>
                    </div>
                    <span className="hangar-list-count">×{fmt(c.catches)}</span>
                  </div>
                ))}
              </div>
            )
        )}
      </div>
    </div>
  );
}
