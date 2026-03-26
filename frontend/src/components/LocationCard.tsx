import { useSettings } from '../hooks/useSettings';

export default function LocationCard() {
  const { settings } = useSettings();
  const lat    = settings.latitude  != null ? settings.latitude.toFixed(4)  : '—';
  const lon    = settings.longitude != null ? settings.longitude.toFixed(4) : '—';
  const radius = settings.radiusNm;

  return (
    <div className="stat-card location-card">
      <div className="stat-card-header">Scan Origin</div>

      {/* Placeholder map area */}
      <div className="location-map-placeholder">
        <svg viewBox="0 0 80 80" className="location-reticle">
          {/* outer ring */}
          <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="3 4" opacity="0.25" />
          {/* inner ring */}
          <circle cx="40" cy="40" r="18" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
          {/* crosshair lines */}
          <line x1="40" y1="6"  x2="40" y2="22" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
          <line x1="40" y1="58" x2="40" y2="74" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
          <line x1="6"  y1="40" x2="22" y2="40" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
          <line x1="58" y1="40" x2="74" y2="40" stroke="currentColor" strokeWidth="0.7" opacity="0.35" />
          {/* center dot */}
          <circle cx="40" cy="40" r="2.5" fill="currentColor" opacity="0.7" />
          {/* radius label */}
          <text x="40" y="67" textAnchor="middle" fontSize="6" fill="currentColor" opacity="0.35"
                fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.5">
            {radius} nm
          </text>
        </svg>
      </div>

      <div className="location-coords">
        <div className="stat-row">
          <span className="s-label">Lat</span>
          <span className="s-value">{lat}</span>
        </div>
        <div className="stat-row">
          <span className="s-label">Lon</span>
          <span className="s-value">{lon}</span>
        </div>
      </div>
    </div>
  );
}
