import { useState, useEffect } from 'react';
import type { Settings } from '../hooks/useSettings';
import { RADIUS_MIN_NM, RADIUS_MAX_NM, RADIUS_DEFAULT_NM, clampRadius } from '../hooks/useSettings';

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

  // Keep form in sync if settings change externally
  useEffect(() => {
    setLat(settings.latitude?.toString() ?? '');
    setLon(settings.longitude?.toString() ?? '');
    setRadius(settings.radiusNm);
  }, [settings]);

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
        <div>
          <div className="settings-heading">{isFirstSetup ? 'Set Up Catching' : 'Settings'}</div>
          <div className="settings-subheading">
            {isFirstSetup
              ? 'Overhead catches flights from wherever you are — these settings tune how, and give you a backup spot when GPS isn\'t available.'
              : 'Tune your hearing radius and set a home location as a GPS fallback.'}
          </div>
        </div>

        {/* How it works */}
        <div className="settings-mode-cards">
          <div className="settings-mode-card">
            <div className="settings-mode-title">How catching works</div>
            <div className="settings-mode-body">
              While you have Overhead open, anything that flies within your hearing radius of your
              live location gets caught and saved to your log. Leave the page and you stop
              catching — you have to be there.
            </div>
          </div>
          <div className="settings-mode-card">
            <div className="settings-mode-title">Home location</div>
            <div className="settings-mode-body">
              A fallback catch point for when your device can't share its location — desktop
              browsers, denied permissions. If live GPS is available it always wins.
            </div>
          </div>
        </div>

        {/* Hearing radius */}
        <div className="settings-section">
          <div className="settings-section-label">Hearing radius</div>
          <div className="settings-location-grid">
            <div className="settings-location-inputs">
              <div className="settings-field">
                <label className="settings-label">
                  Radius · {radius} nm
                </label>
                <input
                  className="settings-slider"
                  type="range"
                  min={RADIUS_MIN_NM}
                  max={RADIUS_MAX_NM}
                  step={1}
                  value={radius}
                  onChange={(e) => setRadius(parseInt(e.target.value, 10) || RADIUS_DEFAULT_NM)}
                />
                <div className="settings-help">
                  How far away counts as "overhead". Think of it as how far you can hear — {RADIUS_DEFAULT_NM} nm
                  is a good default. Bigger catches more, but contacts near the edge won't be
                  visible or audible from where you stand.
                </div>
              </div>
            </div>
            <div className="settings-radius-diagram">
              <RadiusDiagram radiusNm={radius} />
              <div className="settings-radius-caption">
                Hearing radius · {Math.round(radius)} nm
              </div>
            </div>
          </div>
        </div>

        {/* Home / fallback location */}
        <div className="settings-section">
          <div className="settings-section-label">Home location · GPS fallback</div>
          <div className="settings-field-row">
            <div className="settings-field">
              <label className="settings-label">Latitude</label>
              <input
                className="settings-input"
                type="number"
                placeholder="e.g. 42.7077"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                step="any"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">Longitude</label>
              <input
                className="settings-input"
                type="number"
                placeholder="e.g. -83.0315"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                step="any"
              />
            </div>
          </div>
          <button className="settings-btn-geo" onClick={handleGeolocate}>
            ⊕ Use my location
          </button>
          {geoError && (
            <div className="settings-geo-error">{geoError}</div>
          )}
          <div className="settings-help">
            Optional. Used only when live GPS is unavailable. Decimal degrees, six digits is
            plenty (~10 cm precision).
          </div>
        </div>

        {/* Actions */}
        <div className="settings-actions">
          <button className="settings-btn-save" onClick={handleSave}>
            {isFirstSetup ? 'Start Catching' : 'Save'}
          </button>
          <span className={`settings-saved${saved ? ' visible' : ''}`}>
            {isFirstSetup ? 'Launching…' : 'Saved'}
          </span>
        </div>

        {/* Tips */}
        <div className="settings-tips">
          <div className="settings-tips-label">Notes</div>
          <ul className="settings-tips-list">
            <li>Settings sync server-side — sign in from any device and pick up where you left off.</li>
            <li>Catching pauses whenever the page is hidden. Switch back to resume.</li>
            <li>Radius is great-circle distance, not flying time.</li>
            <li>When nothing is in hearing range, the app shows the nearest contact further out — display only, it isn't caught.</li>
            <li>Live aircraft data comes from adsb.lol's public feed.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

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
      width="100%"
      height="auto"
      role="img"
      aria-label={`Hearing radius diagram showing ${Math.round(clamped)} nautical miles around your location`}
      style={{ maxWidth: 200, display: 'block' }}
    >
      {/* Reference outer ring at the max hearing radius */}
      <circle cx={CX} cy={CY} r={MAX_R} fill="none" stroke="rgba(126,184,224,0.08)" strokeWidth="1" strokeDasharray="2 3" />

      {/* Active hearing ring */}
      <circle cx={CX} cy={CY} r={ring} fill="rgba(126,184,224,0.06)" stroke="rgba(126,184,224,0.55)" strokeWidth="1" />

      {/* Center crosshair */}
      <line x1={CX - 10} y1={CY} x2={CX - 6} y2={CY} stroke="rgba(126,184,224,0.5)" strokeWidth="1" />
      <line x1={CX + 6}  y1={CY} x2={CX + 10} y2={CY} stroke="rgba(126,184,224,0.5)" strokeWidth="1" />
      <line x1={CX} y1={CY - 10} x2={CX} y2={CY - 6} stroke="rgba(126,184,224,0.5)" strokeWidth="1" />
      <line x1={CX} y1={CY + 6}  x2={CX} y2={CY + 10} stroke="rgba(126,184,224,0.5)" strokeWidth="1" />

      {/* Center dot */}
      <circle cx={CX} cy={CY} r="2.5" fill="#7eb8e0" />

      {/* Aircraft glyphs — coloured if inside the active ring */}
      {planes.map((p, i) => {
        const dx = p.x - CX;
        const dy = p.y - CY;
        const inside = Math.sqrt(dx * dx + dy * dy) <= ring;
        const color = inside ? '#7eb8e0' : 'rgba(126,184,224,0.16)';
        return (
          <g key={i} transform={`translate(${p.x},${p.y}) rotate(${p.rot})`}>
            <path d="M 0,-4 L 3,3 L 0,1.5 L -3,3 Z" fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
