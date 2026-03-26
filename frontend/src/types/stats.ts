import type { Flight } from './flight';

export interface StatsData {
  summary: {
    totalEvents:    number;
    uniqueAircraft: number;
    operators:      number;
    countries:      number;
    avgAltitudeFt:  number | null;
  };
  summary24h: {
    events:    number;
    aircraft:  number;
    operators: number;
    govCount:  number;
  };
  classification: Array<{
    classification: string;
    totalCount:     number;
    uniqueAircraft: number;
    avgAltitude:    number | null;
    count24h:       number;
  }>;
  altitudeDistribution: Array<{ band: string; count: number }>;
  hourlyActivity:       Array<{ hour: number; events: number }>;
  weeklyActivity:       Array<{ dayName: string; dayNum: number; events: number }>;
  topAircraftTypes: Array<{
    aircraftType:   string;
    manufacturer:   string | null;
    eventCount:     number;
    uniqueAircraft: number;
  }>;
  topOperators: Array<{
    operator:          string;
    eventCount:        number;
    uniqueAircraft:    number;
    topClassification: string;
  }>;
  topCountries: Array<{
    country:        string;
    countryIso:     string | null;
    eventCount:     number;
    uniqueAircraft: number;
  }>;
  topRoutes: Array<{
    originIata:      string;
    originCity:      string | null;
    destinationIata: string;
    destinationCity: string | null;
    eventCount:      number;
  }>;
  recentNotable: Flight[];
  mostSeenAircraft: Array<{
    hex:            string;
    registration:   string | null;
    callsign:       string | null;
    aircraftType:   string | null;
    manufacturer:   string | null;
    operator:       string | null;
    country:        string | null;
    maxTimesSeen:   number;
    eventCount:     number;
    firstSeenEver:  string;
    lastSeenEver:   string;
    classification: string;
  }>;
}
