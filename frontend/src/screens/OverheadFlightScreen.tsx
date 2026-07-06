import { useState } from 'react';
import CallsignBlock from '../components/CallsignBlock';
import AircraftPhoto from '../components/AircraftPhoto';
import HeadingArrow from '../components/HeadingArrow';
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
  matchedRadiusNm?: number;
  /** True when sightings on this screen are being recorded (signed-in catch mode). */
  recording?: boolean;
  /** Distinct aircraft caught since the page was opened. */
  sessionCaught?: number;
  /** How many of those were first-ever catches. */
  sessionNew?: number;
  /** True when catching from the saved home location instead of live GPS. */
  usingFallback?: boolean;
}

function NearbyRow({ flight, onSelect, isActive }: { flight: Flight; onSelect: () => void; isActive: boolean }) {
  // timesSeen >= 1 means this sighting was recorded; exactly 1 means it's the
  // first time this airframe has ever appeared in the user's log.
  const isNewCatch = flight.timesSeen === 1;
  return (
    <button
      type="button"
      className={`overhead-nearby-row strip--${flight.classification} ${isActive ? 'active' : ''}`}
      onClick={onSelect}
    >
      <div className="overhead-nearby-head">
        <span className="overhead-nearby-callsign">{flight.callsign ?? '——'}</span>
        {isNewCatch && <span className="overhead-new-badge">NEW</span>}
        {(flight.interestTier === 'rare' || flight.interestTier === 'interesting') && (
          <span className={`overhead-tier-chip tier--${flight.interestTier}`}>
            {flight.interestTier === 'rare' ? 'RARE' : 'INTERESTING'}
          </span>
        )}
        {flight.timesSeen > 1 && (
          <span className="overhead-seen-count">seen {flight.timesSeen}×</span>
        )}
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
        <span className="overhead-nearby-heading">
          {flight.bearingDeg !== null && <HeadingArrow deg={flight.bearingDeg} />}
          {formatBearing(flight.bearingDeg)} {flight.bearingDeg !== null ? bearingToCardinal(flight.bearingDeg) : ''}
        </span>
      </div>
    </button>
  );
}

export default function OverheadFlightScreen({
  flights,
  matchedRadiusNm,
  recording = false,
  sessionCaught = 0,
  sessionNew = 0,
  usingFallback = false,
}: OverheadFlightScreenProps) {
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
          hex={active.hex}
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
          {matchedRadiusNm ? (
            <div className="overhead-expanded-note">
              Nearest within {matchedRadiusNm} nm — beyond your hearing radius, not caught
            </div>
          ) : null}
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
          {recording ? (
            <div className="overhead-session-note">
              <span>
                Session · {sessionCaught} caught{sessionNew > 0 ? ` · ${sessionNew} new` : ''}
              </span>
              {usingFallback && <span className="overhead-fallback-note">Home location</span>}
            </div>
          ) : (
            <div className="overhead-ephemeral-note">Live · not recorded</div>
          )}
        </div>
      </div>
    </div>
  );
}
