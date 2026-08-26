export type Classification =
  | 'commercial'
  | 'private'
  | 'cargo'
  | 'government'
  | 'military'
  | 'unknown';

export type InterestTier = 'routine' | 'noteworthy' | 'interesting' | 'rare';

export interface InterestComponents {
  emergency:   number; // 0..1
  mission:     number; // 0..1
  rarity:      number; // 0..1  aircraft type / personal type rarity
  kinematic:   number; // 0..1  altitude / speed / vertical-rate anomaly
  route:       number; // 0..1  long-haul, cross-continent, transoceanic
  trajectory:  number; // 0..1  holding / orbit / reversal / GC deviation
  firstSeen:   number; // 0..1  first hex / type / operator / route for this user
}

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

  // ── New raw event signals (kept from adsb.lol, no extra request) ──────────
  squawk: string | null;          // 4-digit transponder code (e.g. "1200", "7700")
  emergency: string | null;       // none|general|lifeguard|minfuel|nordo|unlawful|downed
  baroRateFpm: number | null;     // vertical speed in ft/min (baro_rate || geom_rate)
  category: string | null;        // ADS-B category code (A1..A7, B1..B7, C1..C3)
  mlat: boolean;                  // true when position came from MLAT (no ADS-B out)

  // ── Interest scoring ─────────────────────────────────────────────────────
  interestScore: number;          // 0..100
  interestTier: InterestTier;
  interestReasons: string[];      // human-readable, top-down
  caughtLat: number | null;       // observer position at last catch
  caughtLon: number | null;
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
  // Set only when the route expanded the search radius to find aircraft.
  matchedRadiusNm?: number;
}

// Raw readsb-style shape shared by all the ADS-B providers (adsb.lol,
// adsb.fi, airplanes.live). Only the fields we read are typed; the v2 APIs
// return many more per aircraft.
export interface AdsbAircraft {
  hex: string;
  flight?: string;
  r?: string;                       // registration
  t?: string;                       // type code
  alt_baro?: number | 'ground';
  gs?: number;
  track?: number;
  lat?: number;
  lon?: number;
  dst?: number;

  // Newly captured signals
  squawk?: string;                  // "7700" etc.
  emergency?: string;               // "none" | "general" | "lifeguard" | ...
  baro_rate?: number;               // ft/min, may be negative
  geom_rate?: number;               // ft/min, fallback when baro missing
  category?: string;                // "A7" rotorcraft, "B6" UAV, ...
  mlat?: unknown[];                 // present (non-empty) when MLAT-derived
  alert?: number;                   // 1 if controller alert
  spi?: number;                     // 1 if SPI ident
}

export interface AdsbResponse {
  ac: AdsbAircraft[];
}
