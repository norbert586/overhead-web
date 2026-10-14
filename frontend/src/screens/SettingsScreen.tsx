import { useState } from 'react';
import type { Settings } from '../hooks/useSettings';
import { RADIUS_MIN_NM, RADIUS_MAX_NM, RADIUS_DEFAULT_NM, clampRadius } from '../hooks/useSettings';
import { isSoundEnabled, setSoundEnabled, playCatchSound } from '../utils/catchSound';
import { useThemePreference, type ThemePreference } from '../hooks/useTheme';

interface SettingsScreenProps {
  settings: Settings;
  onSave: (s: Settings) => void;
  isFirstSetup?: boolean;
}

export default function SettingsScreen({ settings, onSave, isFirstSetup = false }: SettingsScreenProps) {
  const [lat, setLat] = useState(settings.latitude?.toString() ?? '');
  const [lon, setLon] = useState(settings.longitude?.toString() ?? '');
  const [radius, setRadius] = useState(settings.radiusNm);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sound, setSound] = useState(isSoundEnabled);
  const { pref: themePref, setPref: setThemePref } = useThemePreference();

  // Re-seed the form when settings change externally (e.g. the server profile
  // arriving after sign-in) — derived state during render, not an effect.
  const [seededFrom, setSeededFrom] = useState(settings);
  if (seededFrom !== settings) {
    setSeededFrom(settings);
    setLat(settings.latitude?.toString() ?? '');
    setLon(settings.longitude?.toString() ?? '');
    setRadius(settings.radiusNm);
  }

  function handleGeolocate() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('Geolocation not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLon(pos.coords.longitude.toFixed(6));
      },
      () => setGeoError('Location access denied.'),
    );
  }

  function handleSave() {
    const parsed: Settings = {
      latitude:  lat ? parseFloat(lat) : null,
      longitude: lon ? parseFloat(lon) : null,
      radiusNm:  clampRadius(radius),
    };
    onSave(parsed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="settings-screen">
      <div className="settings-form">
        <header className="screen-head">
          <h1 className="screen-title">{isFirstSetup ? 'Set up catching' : 'Settings'}</h1>
          <p className="screen-lede">
            While Overhead is open, anything flying inside your hearing radius is caught and saved
            to your log. Close it and catching stops — you have to be there.
          </p>
        </header>

        {/* Hearing radius */}
        <section className="settings-section">
          <h2 className="settings-section-label">Hearing radius</h2>
          <div className="settings-location-grid">
            <div className="settings-location-inputs">
              <div className="settings-field">
                <label className="settings-label" htmlFor="settings-radius">
                  <span>Catch anything within</span>
                  <output className="settings-radius-value">{radius} nm</output>
                </label>
                <input
                  id="settings-radius"
                  className="settings-slider"
                  type="range"
                  min={RADIUS_MIN_NM}
                  max={RADIUS_MAX_NM}
                  step={1}
                  value={radius}
                  style={{ '--fill': `${((radius - RADIUS_MIN_NM) / (RADIUS_MAX_NM - RADIUS_MIN_NM)) * 100}%` } as React.CSSProperties}
                  onChange={(e) => setRadius(parseInt(e.target.value, 10) || RADIUS_DEFAULT_NM)}
                />
                <p className="settings-help">
                  Roughly how far you can hear. {RADIUS_DEFAULT_NM} nm suits most places; a bigger
                  radius catches more, but planes near the edge are hard to see or hear.
                </p>
              </div>
            </div>
            <div className="settings-radius-diagram" aria-hidden="true">
              <RadiusDiagram radiusNm={radius} />
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section className="settings-section">
          <h2 className="settings-section-label">Appearance</h2>
          <div className="theme-picker" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={themePref === o.value}
                className={`theme-option${themePref === o.value ? ' active' : ''}`}
                onClick={() => setThemePref(o.value)}
              >
                <span className={`theme-swatch theme-swatch--${o.value}`} aria-hidden="true" />
                <span className="theme-option-label">{o.label}</span>
              </button>
            ))}
          </div>
          <p className="settings-help">
            {THEME_OPTIONS.find((o) => o.value === themePref)?.help}
          </p>
        </section>

        {/* Catch sound */}
        <section className="settings-section">
          <h2 className="settings-section-label">Sound</h2>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              className="switch"
              checked={sound}
              onChange={(e) => {
                setSound(e.target.checked);
                setSoundEnabled(e.target.checked);
                if (e.target.checked) playCatchSound(false);
              }}
            />
            <span>Play a radio blip when a plane is caught</span>
          </label>
          <p className="settings-help">Rare catches get a brighter note. Saved on this device.</p>
        </section>

        {/* Home / fallback location */}
        <section className="settings-section">
          <h2 className="settings-section-label">Home location</h2>
          <p className="settings-help settings-help--lead">
            Optional. Used only when this device can't share its location — a desktop browser, or
            location turned off. Live GPS always wins.
          </p>
          <div className="settings-field-row">
            <div className="settings-field">
              <label className="settings-label" htmlFor="settings-lat">Latitude</label>
              <input
                id="settings-lat"
                className="settings-input"
                type="number"
                inputMode="decimal"
                placeholder="42.7077"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                step="any"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label" htmlFor="settings-lon">Longitude</label>
              <input
                id="settings-lon"
                className="settings-input"
                type="number"
                inputMode="decimal"
                placeholder="-83.0315"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                step="any"
              />
            </div>
          </div>
          <button className="settings-btn-geo" onClick={handleGeolocate}>
            Use where I am now
          </button>
          {geoError && (
            <div className="settings-geo-error">{geoError}</div>
          )}
        </section>

        {/* Actions */}
        <div className="settings-actions">
          <button className="settings-btn-save" onClick={handleSave}>
            {isFirstSetup ? 'Start catching' : 'Save settings'}
          </button>
          <span className={`settings-saved${saved ? ' visible' : ''}`} role="status">
            {isFirstSetup ? 'Starting…' : 'Saved'}
          </span>
        </div>

        <details className="settings-tips">
          <summary>How catching works</summary>
          <ul className="settings-tips-list">
            <li>Settings follow your account, so another phone or computer picks them up.</li>
            <li>Catching pauses when the app is in the background and resumes when you come back.</li>
            <li>The radius is straight-line distance on the ground, not how high the plane is.</li>
            <li>When nothing is in range you still see the nearest plane further out. It isn't caught.</li>
            <li>Live positions come from the volunteer receivers of adsb.lol and adsb.fi.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; help: string }[] = [
  { value: 'device', label: 'Match device', help: 'Follows your phone or computer’s light and dark setting.' },
  { value: 'sun',    label: 'Follow the sun', help: 'Dark from just after sunset where you are, light again at sunrise.' },
  { value: 'light',  label: 'Light', help: 'Always the day chart.' },
  { value: 'dark',   label: 'Dark', help: 'Always the night chart — easiest on your eyes outside after dark.' },
];

function RadiusDiagram({ radiusNm }: { radiusNm: number }) {
  const VIEW = 200;
  const CX = VIEW / 2;
  const CY = VIEW / 2;
  const MAX_R = 78;
  const clamped = Math.max(RADIUS_MIN_NM, Math.min(RADIUS_MAX_NM, radiusNm));
  const ring = 8 + Math.sqrt(clamped / RADIUS_MAX_NM) * (MAX_R - 8);

  const planes: Array<{ x: number; y: number; rot: number }> = [
    { x: 78,  y: 70,  rot: 35 },
    { x: 125, y: 115, rot: -20 },
    { x: 145, y: 80,  rot: 70 },
    { x: 60,  y: 130, rot: 110 },
    { x: 150, y: 45,  rot: 220 },
    { x: 35,  y: 95,  rot: 305 },
  ];

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role="img"
      aria-label={`Hearing radius diagram showing ${Math.round(clamped)} nautical miles around your location`}
    >
      {/* Reference outer ring at the max hearing radius */}
      <circle cx={CX} cy={CY} r={MAX_R} fill="none" stroke="rgb(var(--accent-rgb) / 0.08)" strokeWidth="1" strokeDasharray="2 3" />

      {/* Active hearing ring */}
      <circle cx={CX} cy={CY} r={ring} fill="rgb(var(--accent-rgb) / 0.06)" stroke="rgb(var(--accent-rgb) / 0.55)" strokeWidth="1" />

      {/* Center crosshair */}
      <line x1={CX - 10} y1={CY} x2={CX - 6} y2={CY} stroke="rgb(var(--accent-rgb) / 0.5)" strokeWidth="1" />
      <line x1={CX + 6}  y1={CY} x2={CX + 10} y2={CY} stroke="rgb(var(--accent-rgb) / 0.5)" strokeWidth="1" />
      <line x1={CX} y1={CY - 10} x2={CX} y2={CY - 6} stroke="rgb(var(--accent-rgb) / 0.5)" strokeWidth="1" />
      <line x1={CX} y1={CY + 6}  x2={CX} y2={CY + 10} stroke="rgb(var(--accent-rgb) / 0.5)" strokeWidth="1" />

      {/* Center dot */}
      <circle cx={CX} cy={CY} r="2.5" fill="var(--accent)" />

      {/* Aircraft glyphs — coloured if inside the active ring */}
      {planes.map((p, i) => {
        const dx = p.x - CX;
        const dy = p.y - CY;
        const inside = Math.sqrt(dx * dx + dy * dy) <= ring;
        const color = inside ? 'var(--accent)' : 'rgb(var(--accent-rgb) / 0.16)';
        return (
          <g key={i} transform={`translate(${p.x},${p.y}) rotate(${p.rot})`}>
            <path d="M 0,-4 L 3,3 L 0,1.5 L -3,3 Z" fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
