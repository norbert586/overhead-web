// Overhead — Frontend Flight Types

export type Classification = 'commercial' | 'private' | 'cargo' | 'government' | 'military' | 'unknown';

export type InterestTier = 'routine' | 'noteworthy' | 'interesting' | 'rare';

export interface Flight {
  hex: string;
  registration: string | null;
  callsign: string | null;
  aircraftType: string | null;
  manufacturer: string | null;
  owner: string | null;
  operator: string | null;
  country: string | null;
  countryIso: string | null;
  originIata: string | null;
  originCity: string | null;
  originCountry: string | null;
  destinationIata: string | null;
  destinationCity: string | null;
  destinationCountry: string | null;
  altitudeFt: number | null;
  speedKts: number | null;
  bearingDeg: number | null;
  distanceNm: number | null;
  classification: Classification;
  timesSeen: number;
  firstSeen: string;
  lastSeen: string;
  photoUrl: string | null;
  squawk: string | null;
  emergency: string | null;
  baroRateFpm: number | null;
  category: string | null;
  mlat: boolean;
  interestScore: number;
  interestTier: InterestTier;
  interestReasons: string[];
}

export interface SessionStats {
  totalDetected: number;
  uniqueAircraft: number;
  activeCount: number;
  classification: {
    commercial: number;
    private: number;
    cargo: number;
    government: number;
  };
  topAircraft: { type: string; count: number }[];
}

export interface FlightsResponse {
  flights: Flight[];
  stats: SessionStats;
  timestamp: string;
  matchedRadiusNm?: number;
}
