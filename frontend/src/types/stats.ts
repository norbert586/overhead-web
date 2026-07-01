import type { Flight } from './flight';

export interface StatsSummaryData {
  summary: {
    totalCatches:   number;
    uniqueAircraft: number;
    operators:      number;
    countries:      number;
    avgAltitudeFt:  number | null;
    streakDays:     number;
    catchDays:      number;
  };
  summary24h: {
    catches:   number;
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
}

export interface StatsAltitudeData {
  altitudeDistribution: Array<{ band: string; count: number }>;
}

export interface StatsActivityData {
  hourlyActivity: Array<{ hour: number; events: number }>;
  weeklyActivity: Array<{ dayName: string; dayNum: number; events: number }>;
}

export interface StatsAircraftTypesData {
  topAircraftTypes: Array<{
    aircraftType:   string;
    manufacturer:   string | null;
    eventCount:     number;
    uniqueAircraft: number;
  }>;
}

export interface StatsOperatorsData {
  topOperators: Array<{
    operator:          string;
    eventCount:        number;
    uniqueAircraft:    number;
    topClassification: string;
  }>;
}

export interface StatsCountriesData {
  topCountries: Array<{
    country:        string;
    countryIso:     string | null;
    eventCount:     number;
    uniqueAircraft: number;
  }>;
}

export interface StatsRoutesData {
  topRoutes: Array<{
    originIata:      string;
    originCity:      string | null;
    destinationIata: string;
    destinationCity: string | null;
    eventCount:      number;
  }>;
}

export interface StatsNotableData {
  recentNotable: Flight[];
}

export interface StatsMostSeenData {
  mostSeenAircraft: Array<{
    hex:            string;
    registration:   string | null;
    callsign:       string | null;
    aircraftType:   string | null;
    manufacturer:   string | null;
    operator:       string | null;
    country:        string | null;
    maxTimesSeen:   number;
    firstSeenEver:  string;
    lastSeenEver:   string;
    classification: string;
  }>;
}
