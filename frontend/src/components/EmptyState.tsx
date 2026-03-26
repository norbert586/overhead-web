import TimesSeenCard from './TimesSeenCard';
import WeatherCard from './WeatherCard';
import MapCard from './MapCard';
import TelemetryGrid from './TelemetryGrid';
import AircraftPhoto from './AircraftPhoto';

export type EmptyVariant = 'no-settings' | 'no-aircraft';

interface EmptyStateProps {
  variant: EmptyVariant;
  onOpenSettings?: () => void;
}

function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

function NoSettings({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <div className="empty-full">
      <PlaneIcon className="empty-icon" />
      <div className="empty-title">No location configured</div>
      <div className="empty-body">Configure your coordinates to begin monitoring.</div>
      {onOpenSettings && (
        <div className="empty-hint" onClick={onOpenSettings} style={{ cursor: 'pointer' }}>
          Open settings →
        </div>
      )}
    </div>
  );
}

function NoAircraft() {
  return (
    <div className="flight-screen">
      {/* Left col — placeholder identity */}
      <div className="col-left">
        <div className="callsign-block">
          <div className="callsign placeholder-text">———</div>
          <div className="aircraft-type placeholder-text">No aircraft detected</div>
        </div>
        <div className="col-divider" />
        <div className="empty-hint" style={{ textAlign: 'left' }}>Scanning…</div>
      </div>

      {/* Center col — empty photo + zeroed telemetry */}
      <div className="col-center">
        <AircraftPhoto photoUrl={null} callsign={null} registration={null} />
        <TelemetryGrid
          altitudeFt={null}
          speedKts={null}
          bearingDeg={null}
          distanceNm={null}
        />
      </div>

      {/* Right col */}
      <div className="col-right">
        <TimesSeenCard timesSeen={0} />
        <WeatherCard />
        <MapCard />
      </div>
    </div>
  );
}

export default function EmptyState({ variant, onOpenSettings }: EmptyStateProps) {
  if (variant === 'no-settings') return <NoSettings onOpenSettings={onOpenSettings} />;
  return <NoAircraft />;
}
