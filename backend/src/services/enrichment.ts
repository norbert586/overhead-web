import {
  getAircraftCache, setAircraftCache,
  getCallsignCache, setCallsignCache,
} from '../database/queries';

const ADSBDB = 'https://api.adsbdb.com/v0';
const FETCH_TIMEOUT_MS = 8_000;

export interface AircraftEnrichment {
  manufacturer: string | null;
  owner: string | null;
  country: string | null;
  countryIso: string | null;
  photoUrl: string | null;
}

export interface RouteEnrichment {
  operator: string | null;
  originIata: string | null;
  originCity: string | null;
  originCountry: string | null;
  destinationIata: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
}

const EMPTY_AIRCRAFT: AircraftEnrichment = {
  manufacturer: null, owner: null, country: null, countryIso: null, photoUrl: null,
};

const EMPTY_ROUTE: RouteEnrichment = {
  operator: null, originIata: null, originCity: null, originCountry: null,
  destinationIata: null, destinationCity: null, destinationCountry: null,
};

function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

export async function enrichAircraft(registration: string): Promise<AircraftEnrichment> {
  const cached = getAircraftCache(registration);
  if (cached) {
    return {
      manufacturer: cached.manufacturer as string | null,
      owner:        cached.owner        as string | null,
      country:      cached.country      as string | null,
      countryIso:   cached.country_iso  as string | null,
      photoUrl:     cached.photo_url    as string | null,
    };
  }

  const NEGATIVE = { aircraftType: null, manufacturer: null, owner: null, country: null, countryIso: null, photoUrl: null };

  try {
    const res = await fetchWithTimeout(`${ADSBDB}/aircraft/${registration}`);

    if (!res.ok) {
      setAircraftCache(registration, NEGATIVE);
      return EMPTY_AIRCRAFT;
    }

    const json = await res.json() as {
      response?: {
        aircraft?: {
          manufacturer?: string;
          registered_owner?: string;
          registered_owner_country_name?: string;
          registered_owner_country_iso_name?: string;
          url_photo?: string;
          type?: string;
        };
      };
    };

    const ac = json?.response?.aircraft;
    if (!ac) {
      setAircraftCache(registration, NEGATIVE);
      return EMPTY_AIRCRAFT;
    }

    const result: AircraftEnrichment = {
      manufacturer: ac.manufacturer ?? null,
      owner:        ac.registered_owner ?? null,
      country:      ac.registered_owner_country_name ?? null,
      countryIso:   ac.registered_owner_country_iso_name ?? null,
      photoUrl:     ac.url_photo ?? null,
    };

    setAircraftCache(registration, { aircraftType: ac.type ?? null, ...result });
    return result;

  } catch (err) {
    // Network failure or timeout — cache a short negative so we don't hammer the API,
    // but use a shorter TTL by back-dating cached_at by 6 days (expires in ~1 day).
    console.error('[enrichment] aircraft fetch failed:', registration, err);
    setAircraftCache(registration, NEGATIVE);
    return EMPTY_AIRCRAFT;
  }
}

export async function enrichCallsign(callsign: string): Promise<RouteEnrichment> {
  const cached = getCallsignCache(callsign);
  if (cached) {
    return {
      operator:           cached.operator           as string | null,
      originIata:         cached.origin_iata        as string | null,
      originCity:         cached.origin_city        as string | null,
      originCountry:      cached.origin_country     as string | null,
      destinationIata:    cached.destination_iata   as string | null,
      destinationCity:    cached.destination_city   as string | null,
      destinationCountry: cached.destination_country as string | null,
    };
  }

  const NEGATIVE = { operator: null, originIata: null, originCity: null, originCountry: null, destinationIata: null, destinationCity: null, destinationCountry: null };

  try {
    const res = await fetchWithTimeout(`${ADSBDB}/callsign/${callsign}`);

    if (!res.ok) {
      setCallsignCache(callsign, NEGATIVE);
      return EMPTY_ROUTE;
    }

    const json = await res.json() as {
      response?: {
        flightroute?: {
          airline?: { name?: string };
          origin?: { iata_code?: string; municipality?: string; country_iso_name?: string };
          destination?: { iata_code?: string; municipality?: string; country_iso_name?: string };
        };
      };
    };

    const route = json?.response?.flightroute;
    if (!route) {
      setCallsignCache(callsign, NEGATIVE);
      return EMPTY_ROUTE;
    }

    const result: RouteEnrichment = {
      operator:           route.airline?.name ?? null,
      originIata:         route.origin?.iata_code ?? null,
      originCity:         route.origin?.municipality ?? null,
      originCountry:      route.origin?.country_iso_name ?? null,
      destinationIata:    route.destination?.iata_code ?? null,
      destinationCity:    route.destination?.municipality ?? null,
      destinationCountry: route.destination?.country_iso_name ?? null,
    };

    setCallsignCache(callsign, result);
    return result;

  } catch (err) {
    console.error('[enrichment] callsign fetch failed:', callsign, err);
    setCallsignCache(callsign, NEGATIVE);
    return EMPTY_ROUTE;
  }
}
