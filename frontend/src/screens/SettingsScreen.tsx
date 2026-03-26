import { useState, useEffect } from 'react';
import type { Settings } from '../hooks/useSettings';

interface SettingsScreenProps {
  settings: Settings;
  onSave: (s: Settings) => void;
}

export default function SettingsScreen({ settings, onSave }: SettingsScreenProps) {
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

  return (
    <div className="settings-screen">
      <div className="settings-form">
        <div>
          <div className="settings-heading">Settings</div>
          <div className="settings-subheading">Configure your monitoring location and scan parameters.</div>
        </div>

        {/* Location */}
        <div className="settings-section">
          <div className="settings-section-label">Location</div>
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
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: 'var(--class-government)', letterSpacing: '0.5px' }}>
              {geoError}
            </div>
          )}
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
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="settings-actions">
          <button className="settings-btn-save" onClick={handleSave}>Save</button>
          <span className={`settings-saved${saved ? ' visible' : ''}`}>Saved</span>
        </div>
      </div>
    </div>
  );
}
