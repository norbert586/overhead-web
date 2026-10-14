import { useEffect, useState } from 'react';
import { useNow } from '../hooks/useNow';
import { prefetchPhotos } from '../utils/photos';
import { withViewTransition } from '../utils/motion';
import { elevationDeg, lookPhrase } from '../utils/sky';
import CallsignBlock from '../components/CallsignBlock';
import AircraftPhoto from '../components/AircraftPhoto';
import HeadingArrow from '../components/HeadingArrow';
import RouteBlock from '../components/RouteBlock';
import TelemetryGrid from '../components/TelemetryGrid';
import IntelCard from '../components/IntelCard';
import SkyDome from '../components/SkyDome';
import ShareCatchButton from '../components/ShareCatch';
import { TIER_LABEL, CLASS_LABEL } from '../utils/labels';
import {
  formatAltitude,
  formatDistance,
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
  /** Epoch ms the on-screen positions date from, set only while the feed is delayed. */
  staleSince?: number | null;
  /** The catch point — places the sun and aircraft on the sky dome. */
  latitude?: number | null;
  longitude?: number | null;
}

function NearbyRow({ flight, onSelect, isActive }: { flight: Flight; onSelect: () => void; isActive: boolean }) {
  // timesSeen >= 1 means this sighting was recorded; exactly 1 means it's the
  // first time this airframe has ever appeared in the user's log.
  const isNewCatch = flight.timesSeen === 1;
  const notable = flight.interestTier === 'rare' || flight.interestTier === 'interesting';
  return (
    <button
      type="button"
      className={`overhead-nearby-row strip--${flight.classification} ${isActive ? 'active' : ''}`}
      onClick={onSelect}
      aria-pressed={isActive}
    >
      <div className="overhead-nearby-head">
        <span className="overhead-nearby-callsign">{flight.callsign ?? flight.registration ?? 'No callsign'}</span>
        {isNewCatch && <span className="overhead-new-badge">New</span>}
        {notable && (
          <span className={`overhead-tier-chip tier--${flight.interestTier}`}>{TIER_LABEL[flight.interestTier]}</span>
        )}
        <span className={`overhead-nearby-class class-text--${flight.classification}`}>{CLASS_LABEL[flight.classification]}</span>
      </div>
      <div className="overhead-nearby-sub">
        {[flight.manufacturer, flight.aircraftType].filter(Boolean).join(' ') || 'Unknown type'}
        {flight.timesSeen > 1 && <span className="overhead-seen-count"> — caught {flight.timesSeen}×</span>}
      </div>
      <div className="overhead-nearby-stats">
        <span>{formatDistance(flight.distanceNm)} nm away</span>
        <span>{formatAltitude(flight.altitudeFt)} ft</span>
        {flight.bearingDeg !== null && (
          <span className="overhead-nearby-heading">
            <HeadingArrow deg={flight.bearingDeg} />
            {bearingToCardinal(flight.bearingDeg)}
          </span>
        )}
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
  staleSince = null,
  latitude = null,
  longitude = null,
}: OverheadFlightScreenProps) {
  // Selection follows the aircraft, not its place in the list — the list is
  // re-sorted by distance every poll, and an index would hop to another plane.
  const [activeHex, setActiveHex] = useState<string | null>(null);
  const now = useNow(staleSince !== null);
  const delayedSec = staleSince !== null ? Math.max(0, Math.round((now - staleSince) / 1000)) : null;
  const active = flights.find((f) => f.hex === activeHex) ?? flights[0];

  const select = (hex: string) => {
    if (hex === active.hex) return;
    withViewTransition(() => setActiveHex(hex), 'aircraft');
  };

  // Fetch the other nearby aircraft's photos ahead of a tap, so switching is instant.
  const nearbyKey = flights.map((f) => `${f.hex}|${f.registration ?? ''}|${f.aircraftType ?? ''}|${f.callsign ?? ''}`).join(',');
  useEffect(() => {
    prefetchPhotos(nearbyKey.split(',').map((k) => {
      const [hex, registration, aircraftType, callsign] = k.split('|');
      return { hex, registration: registration || null, aircraftType: aircraftType || null, callsign: callsign || null };
    }));
  }, [nearbyKey]);

  const look = lookPhrase(active.azimuthDeg ?? null, elevationDeg(active.altitudeFt, active.distanceNm));

  return (
    <div className="flight-screen overhead-screen">
      <div className="col-left">
        <div className="catch-id">
          <CallsignBlock
            callsign={active.callsign}
            registration={active.registration}
            aircraftType={active.aircraftType}
            manufacturer={active.manufacturer}
            operator={active.operator}
            classification={active.classification}
            interestTier={active.interestTier}
            timesSeen={recording ? active.timesSeen : 0}
            action={
              <ShareCatchButton
                flight={active}
                mode={recording && active.timesSeen >= 1 ? 'caught' : 'live'}
                nearby={!!matchedRadiusNm}
              />
            }
          />
        </div>
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
          squawk={active.squawk}
        />
      </div>

      <div className="col-center">
        <AircraftPhoto
          callsign={active.callsign}
          registration={active.registration}
          hex={active.hex}
          aircraftType={active.aircraftType}
        />
        <TelemetryGrid
          subject={active.hex}
          altitudeFt={active.altitudeFt}
          speedKts={active.speedKts}
          bearingDeg={active.bearingDeg}
          distanceNm={active.distanceNm}
          baroRateFpm={active.baroRateFpm}
        />
      </div>

      <div className="col-right">
        <section className="sky-card" aria-label="Where to look">
          <SkyDome
            latitude={latitude}
            longitude={longitude}
            flights={flights}
            activeHex={active.hex}
            onSelect={select}
          />
          <div className="sky-card-text">
            <p className="sky-look">{look ?? 'Position not broadcast'}</p>
            <p className="sky-hint">Centre is straight up, the rim is the horizon. Tap a plane to switch.</p>
          </div>
        </section>

        <section className="overhead-nearby-card" aria-label="Aircraft overhead">
          <div className="overhead-nearby-header">
            <h2>Overhead now</h2>
            <span className="overhead-nearby-count">{flights.length}</span>
          </div>
          {delayedSec !== null ? (
            <div className="overhead-stale-note" role="status">
              Feed delayed — positions from {delayedSec}s ago, reconnecting
            </div>
          ) : null}
          {matchedRadiusNm ? (
            <div className="overhead-expanded-note">
              Nothing within your hearing radius. Nearest planes within {matchedRadiusNm} nm, shown but not caught.
            </div>
          ) : null}
          <div className="overhead-nearby-list">
            {flights.map((f) => (
              <NearbyRow
                key={f.hex}
                flight={f}
                isActive={f.hex === active.hex}
                onSelect={() => select(f.hex)}
              />
            ))}
          </div>
          {recording ? (
            <div className="overhead-session-note">
              <span>
                {sessionCaught === 0 ? 'Nothing caught yet this visit'
                  : `${sessionCaught} caught this visit${sessionNew > 0 ? `, ${sessionNew} new to your log` : ''}`}
              </span>
              {usingFallback && <span className="overhead-fallback-note">From your home location</span>}
            </div>
          ) : (
            <div className="overhead-ephemeral-note">Live view — sign in to keep what you catch</div>
          )}
        </section>
      </div>
    </div>
  );
}
