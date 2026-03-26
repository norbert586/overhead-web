export type Classification =
  | 'commercial'
  | 'private'
  | 'cargo'
  | 'government'
  | 'military'
  | 'unknown';

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
}

// Raw shape from adsb.lol
export interface AdsbAircraft {
  hex: string;
  flight?: string;
  r?: string;   // registration
  t?: string;   // type code
  alt_baro?: number | 'ground';
  gs?: number;
  track?: number;
  lat?: number;
  lon?: number;
  dst?: number;
}

export interface AdsbResponse {
  ac: AdsbAircraft[];
}
