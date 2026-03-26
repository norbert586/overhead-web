import { countryToFlag } from '../utils/formatting';

interface RouteBlockProps {
  originIata: string | null;
  originCity: string | null;
  originCountry: string | null;
  destinationIata: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
}

function Airport({
  iata,
  city,
  country,
}: {
  iata: string | null;
  city: string | null;
  country: string | null;
}) {
  return (
    <div className="route-airport">
      <div className="iata">{iata ?? '???'}</div>
      {city && <div className="city">{city}</div>}
      {country && <span className="flag">{countryToFlag(country)}</span>}
    </div>
  );
}

function Connector() {
  return (
    <div className="route-connector">
      <div className="route-seg" />
      <div className="route-seg" />
      <div className="route-dot" />
      <div className="route-seg" />
      <div className="route-seg" />
    </div>
  );
}

export default function RouteBlock({
  originIata,
  originCity,
  originCountry,
  destinationIata,
  destinationCity,
  destinationCountry,
}: RouteBlockProps) {
  // No route data at all — render nothing
  if (!originIata && !destinationIata) return null;

  return (
    <div className="route-block">
      <Airport iata={originIata} city={originCity} country={originCountry} />
      <Connector />
      <Airport iata={destinationIata} city={destinationCity} country={destinationCountry} />
    </div>
  );
}
