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
  align,
}: {
  iata: string | null;
  city: string | null;
  country: string | null;
  align: 'start' | 'end';
}) {
  return (
    <div className={`route-airport route-airport--${align}`}>
      <div className="iata">{iata ?? '———'}</div>
      <div className="city">
        {country && <span className="flag">{countryToFlag(country)}</span>}
        {city ?? 'Unknown'}
      </div>
    </div>
  );
}

// A great-circle arc rather than a dashed line: the route as it's flown,
// with the aircraft riding it.
function Arc() {
  return (
    <svg className="route-arc" viewBox="0 0 120 36" preserveAspectRatio="none" aria-hidden="true">
      <path className="route-arc-path" d="M4 32 Q60 -6 116 32" vectorEffect="non-scaling-stroke" />
      <circle className="route-arc-end" cx="4" cy="32" r="2.5" />
      <circle className="route-arc-end" cx="116" cy="32" r="2.5" />
    </svg>
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
  // No route on file — say so quietly instead of leaving a hole. Many GA and
  // military flights simply don't file a public route.
  if (!originIata && !destinationIata) {
    return <div className="route-block route-block--none">No route filed — common for private and military flights.</div>;
  }

  return (
    <div className="route-block" aria-label={`From ${originCity ?? originIata ?? 'unknown'} to ${destinationCity ?? destinationIata ?? 'unknown'}`}>
      <Airport iata={originIata} city={originCity} country={originCountry} align="start" />
      <div className="route-connector">
        <Arc />
        <svg className="route-plane" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
      </div>
      <Airport iata={destinationIata} city={destinationCity} country={destinationCountry} align="end" />
    </div>
  );
}
