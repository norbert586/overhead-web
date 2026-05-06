import { useState } from 'react';
import CallsignBlock from '../components/CallsignBlock';
import AircraftPhoto from '../components/AircraftPhoto';
import RouteBlock from '../components/RouteBlock';
import TelemetryGrid from '../components/TelemetryGrid';
import IntelCard from '../components/IntelCard';
import ClassificationBadge from '../components/ClassificationBadge';
import {
  formatAltitude,
  formatSpeed,
  formatDistance,
  formatBearing,
  bearingToCardinal,
} from '../utils/formatting';
import type { Flight } from '../types/flight';

interface OverheadFlightScreenProps {
  flights: Flight[];
}

function NearbyRow({ flight, onSelect, isActive }: { flight: Flight; onSelect: () => void; isActive: boolean }) {
  return (
    <button
      type="button"
      className={`overhead-nearby-row ${isActive ? 'active' : ''}`}
      onClick={onSelect}
    >
      <div className="overhead-nearby-head">
        <span className="overhead-nearby-callsign">{flight.callsign ?? '——'}</span>
        <ClassificationBadge classification={flight.classification} />
      </div>
      <div className="overhead-nearby-sub">
        <span>{[flight.manufacturer, flight.aircraftType].filter(Boolean).join(' ') || '—'}</span>
      </div>
      <div className="overhead-nearby-stats">
        <span>{formatDistance(flight.distanceNm)} nm</span>
        <span>·</span>
        <span>{formatAltitude(flight.altitudeFt)} ft</span>
        <span>·</span>
        <span>{formatSpeed(flight.speedKts)} kts</span>
        <span>·</span>
        <span>
          {formatBearing(flight.bearingDeg)} {flight.bearingDeg !== null ? bearingToCardinal(flight.bearingDeg) : ''}
        </span>
      </div>
    </button>
  );
}

export default function OverheadFlightScreen({ flights }: OverheadFlightScreenProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = Math.min(activeIdx, flights.length - 1);
  const active = flights[safeIdx];

  return (
    <div className="flight-screen overhead-screen">
      <div className="col-left">
        <CallsignBlock
          callsign={active.callsign}
          aircraftType={active.aircraftType}
          manufacturer={active.manufacturer}
          operator={active.operator}
          classification={active.classification}
        />
        <div className="col-divider" />
        <RouteBlock
          originIata={active.originIata}
          originCity={active.originCity}
          originCountry={active.originCountry}
          destinationIata={active.destinationIata}
          destinationCity={active.destinationCity}
          destinationCountry={active.destinationCountry}
        />
        <IntelCard
          country={active.country}
          countryIso={active.countryIso}
          registration={active.registration}
          hex={active.hex}
          typeCode={active.aircraftType}
          manufacturer={active.manufacturer}
        />
      </div>

      <div className="col-center">
        <AircraftPhoto
          photoUrl={active.photoUrl}
          callsign={active.callsign}
          registration={active.registration}
          aircraftType={active.aircraftType}
        />
        <TelemetryGrid
          altitudeFt={active.altitudeFt}
          speedKts={active.speedKts}
          bearingDeg={active.bearingDeg}
          distanceNm={active.distanceNm}
        />
      </div>

      <div className="col-right">
        <div className="overhead-nearby-card">
          <div className="overhead-nearby-header">
            <span>Overhead now</span>
            <span className="overhead-nearby-count">{flights.length}</span>
          </div>
          <div className="overhead-nearby-list">
            {flights.map((f, i) => (
              <NearbyRow
                key={f.hex}
                flight={f}
                isActive={i === safeIdx}
                onSelect={() => setActiveIdx(i)}
              />
            ))}
          </div>
          <div className="overhead-ephemeral-note">Live · not recorded</div>
        </div>
      </div>
    </div>
  );
}
