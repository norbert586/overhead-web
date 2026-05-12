import { useState, useEffect } from 'react';
import type { Settings } from '../hooks/useSettings';

interface SettingsScreenProps {
  settings: Settings;
  onSave: (s: Settings) => void;
  isFirstSetup?: boolean;
}

export default function SettingsScreen({ settings, onSave, isFirstSetup = false }: SettingsScreenProps) {
  const [lat, setLat] = useState(settings.latitude?.toString() ?? '');
  const [lon, setLon] = useState(settings.longitude?.toString() ?? '');
  const [radius, setRadius] = useState(settings.radiusNm.toString());
  const [interval, setInterval] = useState(settings.pollIntervalSec.toString());
  const [geoError, setGeoError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Keep form in sync if settings change externally
  useEffect(() => {
    setLat(settings.latitude?.toString() ?? '');
    setLon(settings.longitude?.toString() ?? '');
    setRadius(settings.radiusNm.toString());
    setInterval(settings.pollIntervalSec.toString());
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
      latitude:        lat     ? parseFloat(lat)     : null,
      longitude:       lon     ? parseFloat(lon)     : null,
      radiusNm:        radius  ? parseFloat(radius)  : 25,
      pollIntervalSec: interval ? parseFloat(interval) : 12,
    };
    onSave(parsed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const parsedRadius = parseFloat(radius);
  const radiusForDiagram = Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 25;

  return (
    <div className="settings-screen">
      <div className="settings-form">
        <div>
          <div className="settings-heading">{isFirstSetup ? 'Set Your Location' : 'Settings'}</div>
          <div className="settings-subheading">
            {isFirstSetup
              ? 'Enter your home coordinates to start tracking aircraft overhead. Your location is saved to your account — use any device, same data.'
              : 'Configure your monitoring location and scan parameters.'}
          </div>
        </div>

        {/* How it works */}
        <div className="settings-mode-cards">
          <div className="settings-mode-card">
            <div className="settings-mode-title">Home Tab</div>
            <div className="settings-mode-body">
              Continuously scans around your fixed location below and records every contact to your log.
              Uses the radius and poll interval you set here.
            </div>
          </div>
          <div className="settings-mode-card">
            <div className="settings-mode-title">Overhead Tab</div>
            <div className="settings-mode-body">
              Uses your device's live GPS to show the closest aircraft right now. Ephemeral — nothing
              is recorded. Ignores the values on this screen.
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="settings-section">
          <div className="settings-section-label">Location · Home Tab</div>
          <div className="settings-location-grid">
            <div className="settings-location-inputs">
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
                Your fixed monitoring point for the Home tab. Decimal degrees, six digits is plenty
                (~10 cm precision).
              </div>
            </div>
            <div className="settings-radius-diagram">
              <RadiusDiagram radiusNm={radiusForDiagram} />
              <div className="settings-radius-caption">
                Scan radius · {Math.round(radiusForDiagram)} nm
              </div>
            </div>
          </div>
        </div>

        {/* Scan parameters */}
        <div className="settings-section">
          <div className="settings-section-label">Scan</div>
          <div className="settings-field-row">
            <div className="settings-field">
              <label className="settings-label">Radius (nm)</label>
              <input
                className="settings-input"
                type="number"
                placeholder="25"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                min="1"
                max="250"
              />
              <div className="settings-help">
                How far around your point to scan. Typical 15–40 nm. Larger sees more, but contacts
                near the edge may not be visually overhead.
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-label">Poll interval (sec)</label>
              <input
                className="settings-input"
                type="number"
                placeholder="12"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                min="5"
                max="60"
              />
              <div className="settings-help">
                How often to fetch live data. Typical 10–20 sec. Lower is fresher; higher is gentler
                on the upstream ADS-B feed.
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="settings-actions">
          <button className="settings-btn-save" onClick={handleSave}>
            {isFirstSetup ? 'Start Tracking' : 'Save'}
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
            <li>Radius is great-circle distance, not flying time.</li>
            <li>The Overhead tab ignores these values; it uses live GPS with a 10 → 25 → 50 nm fallback when the nearer rings are empty.</li>
            <li>Live aircraft data comes from adsb.lol's public feed. Be polite — keep the poll interval at 10 sec or higher.</li>
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
  const clamped = Math.max(1, Math.min(250, radiusNm));
  const ring = 8 + Math.sqrt(clamped / 250) * (MAX_R - 8);

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
      aria-label={`Scan radius diagram showing ${Math.round(clamped)} nautical miles around your location`}
      style={{ maxWidth: 200, display: 'block' }}
    >
      {/* Reference outer ring at the 250 nm cap */}
      <circle cx={CX} cy={CY} r={MAX_R} fill="none" stroke="rgba(126,184,224,0.08)" strokeWidth="1" strokeDasharray="2 3" />

      {/* Active scan ring */}
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
