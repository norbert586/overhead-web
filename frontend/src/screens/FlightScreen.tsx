import CallsignBlock from '../components/CallsignBlock';
import AircraftPhoto from '../components/AircraftPhoto';
import RouteBlock from '../components/RouteBlock';
import TelemetryGrid from '../components/TelemetryGrid';
import IntelCard from '../components/IntelCard';
import TimesSeenCard from '../components/TimesSeenCard';
import WeatherCard from '../components/WeatherCard';
import MapCard from '../components/MapCard';
import type { Flight } from '../types/flight';

interface FlightScreenProps {
  flight: Flight;
}

export default function FlightScreen({ flight }: FlightScreenProps) {
  return (
    <div className="flight-screen">
      {/* ── Left column: Identity + Route + Intel ── */}
      <div className="col-left">
        <CallsignBlock
          callsign={flight.callsign}
          aircraftType={flight.aircraftType}
          manufacturer={flight.manufacturer}
          operator={flight.operator}
          classification={flight.classification}
        />
        <div className="col-divider" />
        <RouteBlock
          originIata={flight.originIata}
          originCity={flight.originCity}
          originCountry={flight.originCountry}
          destinationIata={flight.destinationIata}
          destinationCity={flight.destinationCity}
          destinationCountry={flight.destinationCountry}
        />
        <IntelCard
          country={flight.country}
          countryIso={flight.countryIso}
          registration={flight.registration}
          hex={flight.hex}
          typeCode={flight.aircraftType}
          manufacturer={flight.manufacturer}
        />
      </div>

      {/* ── Center column: Photo + Telemetry ── */}
      <div className="col-center">
        <AircraftPhoto
          photoUrl={flight.photoUrl}
          callsign={flight.callsign}
          registration={flight.registration}
        />
        <TelemetryGrid
          altitudeFt={flight.altitudeFt}
          speedKts={flight.speedKts}
          bearingDeg={flight.bearingDeg}
          distanceNm={flight.distanceNm}
        />
      </div>

      {/* ── Right column ── */}
      <div className="col-right">
        <TimesSeenCard timesSeen={flight.timesSeen} />
        <WeatherCard />
        <MapCard />
      </div>
    </div>
  );
}
