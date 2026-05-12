// Reference data tables used by the interest scoring engine.
//
// Everything here is static, hand-curated, and loaded once at import time —
// nothing in this file does I/O or hits the DB. Coordinates are accurate to
// ~0.01° which is more than enough for great-circle distance bucketing.

export type Continent = 'NA' | 'SA' | 'EU' | 'AF' | 'AS' | 'OC' | 'AN';

export interface AirportCoord {
  lat: number;
  lon: number;
  iso: string;           // ISO 3166-1 alpha-2
  continent: Continent;
}

// ── Airports ────────────────────────────────────────────────────────────────
// World's busiest hubs + regional gateways. Covers ~95% of scheduled traffic
// likely to surface as origin/dest from adsbdb's callsign cache. Routes whose
// origin or dest is missing here gracefully degrade to a 0 route score.

export const AIRPORT_COORDS: Record<string, AirportCoord> = {
  // ── North America (US) ──
  ATL: { lat:  33.64, lon:  -84.43, iso: 'US', continent: 'NA' },
  LAX: { lat:  33.94, lon: -118.41, iso: 'US', continent: 'NA' },
  ORD: { lat:  41.97, lon:  -87.91, iso: 'US', continent: 'NA' },
  DFW: { lat:  32.90, lon:  -97.04, iso: 'US', continent: 'NA' },
  DEN: { lat:  39.86, lon: -104.67, iso: 'US', continent: 'NA' },
  JFK: { lat:  40.64, lon:  -73.78, iso: 'US', continent: 'NA' },
  EWR: { lat:  40.69, lon:  -74.17, iso: 'US', continent: 'NA' },
  LGA: { lat:  40.78, lon:  -73.87, iso: 'US', continent: 'NA' },
  SFO: { lat:  37.62, lon: -122.38, iso: 'US', continent: 'NA' },
  SEA: { lat:  47.45, lon: -122.31, iso: 'US', continent: 'NA' },
  MCO: { lat:  28.43, lon:  -81.31, iso: 'US', continent: 'NA' },
  MIA: { lat:  25.80, lon:  -80.29, iso: 'US', continent: 'NA' },
  FLL: { lat:  26.07, lon:  -80.15, iso: 'US', continent: 'NA' },
  PHX: { lat:  33.44, lon: -112.01, iso: 'US', continent: 'NA' },
  IAH: { lat:  29.98, lon:  -95.34, iso: 'US', continent: 'NA' },
  HOU: { lat:  29.65, lon:  -95.28, iso: 'US', continent: 'NA' },
  BOS: { lat:  42.37, lon:  -71.01, iso: 'US', continent: 'NA' },
  MSP: { lat:  44.88, lon:  -93.22, iso: 'US', continent: 'NA' },
  DTW: { lat:  42.21, lon:  -83.35, iso: 'US', continent: 'NA' },
  PHL: { lat:  39.87, lon:  -75.24, iso: 'US', continent: 'NA' },
  LAS: { lat:  36.08, lon: -115.15, iso: 'US', continent: 'NA' },
  CLT: { lat:  35.21, lon:  -80.94, iso: 'US', continent: 'NA' },
  DCA: { lat:  38.85, lon:  -77.04, iso: 'US', continent: 'NA' },
  IAD: { lat:  38.95, lon:  -77.46, iso: 'US', continent: 'NA' },
  BWI: { lat:  39.18, lon:  -76.67, iso: 'US', continent: 'NA' },
  SLC: { lat:  40.79, lon: -111.98, iso: 'US', continent: 'NA' },
  SAN: { lat:  32.73, lon: -117.19, iso: 'US', continent: 'NA' },
  PDX: { lat:  45.59, lon: -122.60, iso: 'US', continent: 'NA' },
  HNL: { lat:  21.32, lon: -157.92, iso: 'US', continent: 'NA' },
  ANC: { lat:  61.17, lon: -150.00, iso: 'US', continent: 'NA' },
  AUS: { lat:  30.20, lon:  -97.67, iso: 'US', continent: 'NA' },
  RDU: { lat:  35.88, lon:  -78.79, iso: 'US', continent: 'NA' },
  STL: { lat:  38.75, lon:  -90.37, iso: 'US', continent: 'NA' },
  MDW: { lat:  41.79, lon:  -87.75, iso: 'US', continent: 'NA' },
  MEM: { lat:  35.04, lon:  -89.98, iso: 'US', continent: 'NA' },
  SDF: { lat:  38.17, lon:  -85.74, iso: 'US', continent: 'NA' },
  CVG: { lat:  39.05, lon:  -84.66, iso: 'US', continent: 'NA' },
  CLE: { lat:  41.41, lon:  -81.85, iso: 'US', continent: 'NA' },
  PIT: { lat:  40.49, lon:  -80.23, iso: 'US', continent: 'NA' },
  TPA: { lat:  27.98, lon:  -82.53, iso: 'US', continent: 'NA' },

  // ── North America (CA / MX / Caribbean) ──
  YYZ: { lat:  43.68, lon:  -79.62, iso: 'CA', continent: 'NA' },
  YVR: { lat:  49.20, lon: -123.18, iso: 'CA', continent: 'NA' },
  YUL: { lat:  45.47, lon:  -73.74, iso: 'CA', continent: 'NA' },
  YYC: { lat:  51.12, lon: -114.01, iso: 'CA', continent: 'NA' },
  YOW: { lat:  45.32, lon:  -75.67, iso: 'CA', continent: 'NA' },
  YEG: { lat:  53.31, lon: -113.58, iso: 'CA', continent: 'NA' },
  MEX: { lat:  19.44, lon:  -99.07, iso: 'MX', continent: 'NA' },
  CUN: { lat:  21.04, lon:  -86.88, iso: 'MX', continent: 'NA' },
  GDL: { lat:  20.52, lon: -103.31, iso: 'MX', continent: 'NA' },
  MTY: { lat:  25.78, lon: -100.11, iso: 'MX', continent: 'NA' },
  HAV: { lat:  22.99, lon:  -82.41, iso: 'CU', continent: 'NA' },
  MBJ: { lat:  18.50, lon:  -77.91, iso: 'JM', continent: 'NA' },
  NAS: { lat:  25.04, lon:  -77.47, iso: 'BS', continent: 'NA' },
  SJU: { lat:  18.44, lon:  -66.00, iso: 'PR', continent: 'NA' },
  PUJ: { lat:  18.57, lon:  -68.36, iso: 'DO', continent: 'NA' },
  SDQ: { lat:  18.43, lon:  -69.67, iso: 'DO', continent: 'NA' },

  // ── Europe ──
  LHR: { lat:  51.47, lon:   -0.45, iso: 'GB', continent: 'EU' },
  LGW: { lat:  51.15, lon:   -0.18, iso: 'GB', continent: 'EU' },
  STN: { lat:  51.89, lon:    0.24, iso: 'GB', continent: 'EU' },
  LTN: { lat:  51.87, lon:   -0.37, iso: 'GB', continent: 'EU' },
  LCY: { lat:  51.51, lon:    0.05, iso: 'GB', continent: 'EU' },
  MAN: { lat:  53.36, lon:   -2.27, iso: 'GB', continent: 'EU' },
  EDI: { lat:  55.95, lon:   -3.37, iso: 'GB', continent: 'EU' },
  CDG: { lat:  49.01, lon:    2.55, iso: 'FR', continent: 'EU' },
  ORY: { lat:  48.73, lon:    2.36, iso: 'FR', continent: 'EU' },
  NCE: { lat:  43.66, lon:    7.21, iso: 'FR', continent: 'EU' },
  LYS: { lat:  45.73, lon:    5.08, iso: 'FR', continent: 'EU' },
  AMS: { lat:  52.31, lon:    4.77, iso: 'NL', continent: 'EU' },
  BRU: { lat:  50.90, lon:    4.48, iso: 'BE', continent: 'EU' },
  FRA: { lat:  50.04, lon:    8.56, iso: 'DE', continent: 'EU' },
  MUC: { lat:  48.35, lon:   11.79, iso: 'DE', continent: 'EU' },
  BER: { lat:  52.37, lon:   13.50, iso: 'DE', continent: 'EU' },
  HAM: { lat:  53.63, lon:    9.99, iso: 'DE', continent: 'EU' },
  DUS: { lat:  51.29, lon:    6.77, iso: 'DE', continent: 'EU' },
  CGN: { lat:  50.87, lon:    7.14, iso: 'DE', continent: 'EU' },
  STR: { lat:  48.69, lon:    9.22, iso: 'DE', continent: 'EU' },
  ZRH: { lat:  47.46, lon:    8.55, iso: 'CH', continent: 'EU' },
  GVA: { lat:  46.24, lon:    6.11, iso: 'CH', continent: 'EU' },
  VIE: { lat:  48.11, lon:   16.57, iso: 'AT', continent: 'EU' },
  MAD: { lat:  40.50, lon:   -3.57, iso: 'ES', continent: 'EU' },
  BCN: { lat:  41.30, lon:    2.08, iso: 'ES', continent: 'EU' },
  AGP: { lat:  36.67, lon:   -4.50, iso: 'ES', continent: 'EU' },
  PMI: { lat:  39.55, lon:    2.74, iso: 'ES', continent: 'EU' },
  LIS: { lat:  38.78, lon:   -9.14, iso: 'PT', continent: 'EU' },
  OPO: { lat:  41.24, lon:   -8.68, iso: 'PT', continent: 'EU' },
  FCO: { lat:  41.80, lon:   12.24, iso: 'IT', continent: 'EU' },
  MXP: { lat:  45.63, lon:    8.73, iso: 'IT', continent: 'EU' },
  LIN: { lat:  45.45, lon:    9.28, iso: 'IT', continent: 'EU' },
  VCE: { lat:  45.51, lon:   12.35, iso: 'IT', continent: 'EU' },
  NAP: { lat:  40.89, lon:   14.29, iso: 'IT', continent: 'EU' },
  ATH: { lat:  37.94, lon:   23.94, iso: 'GR', continent: 'EU' },
  IST: { lat:  41.28, lon:   28.75, iso: 'TR', continent: 'EU' },
  SAW: { lat:  40.90, lon:   29.31, iso: 'TR', continent: 'EU' },
  DUB: { lat:  53.42, lon:   -6.27, iso: 'IE', continent: 'EU' },
  CPH: { lat:  55.62, lon:   12.66, iso: 'DK', continent: 'EU' },
  ARN: { lat:  59.65, lon:   17.92, iso: 'SE', continent: 'EU' },
  OSL: { lat:  60.19, lon:   11.10, iso: 'NO', continent: 'EU' },
  HEL: { lat:  60.32, lon:   24.96, iso: 'FI', continent: 'EU' },
  WAW: { lat:  52.17, lon:   20.97, iso: 'PL', continent: 'EU' },
  KRK: { lat:  50.08, lon:   19.79, iso: 'PL', continent: 'EU' },
  PRG: { lat:  50.10, lon:   14.26, iso: 'CZ', continent: 'EU' },
  BUD: { lat:  47.44, lon:   19.26, iso: 'HU', continent: 'EU' },
  OTP: { lat:  44.57, lon:   26.10, iso: 'RO', continent: 'EU' },
  SOF: { lat:  42.69, lon:   23.41, iso: 'BG', continent: 'EU' },
  KEF: { lat:  63.99, lon:  -22.61, iso: 'IS', continent: 'EU' },
  SVO: { lat:  55.97, lon:   37.41, iso: 'RU', continent: 'EU' },
  DME: { lat:  55.41, lon:   37.91, iso: 'RU', continent: 'EU' },
  VKO: { lat:  55.59, lon:   37.27, iso: 'RU', continent: 'EU' },
  LED: { lat:  59.80, lon:   30.27, iso: 'RU', continent: 'EU' },

  // ── Asia ──
  HND: { lat:  35.55, lon:  139.78, iso: 'JP', continent: 'AS' },
  NRT: { lat:  35.77, lon:  140.39, iso: 'JP', continent: 'AS' },
  KIX: { lat:  34.43, lon:  135.23, iso: 'JP', continent: 'AS' },
  ITM: { lat:  34.79, lon:  135.44, iso: 'JP', continent: 'AS' },
  NGO: { lat:  34.86, lon:  136.81, iso: 'JP', continent: 'AS' },
  ICN: { lat:  37.46, lon:  126.44, iso: 'KR', continent: 'AS' },
  GMP: { lat:  37.56, lon:  126.79, iso: 'KR', continent: 'AS' },
  PEK: { lat:  40.08, lon:  116.58, iso: 'CN', continent: 'AS' },
  PKX: { lat:  39.51, lon:  116.41, iso: 'CN', continent: 'AS' },
  PVG: { lat:  31.14, lon:  121.81, iso: 'CN', continent: 'AS' },
  SHA: { lat:  31.20, lon:  121.34, iso: 'CN', continent: 'AS' },
  CAN: { lat:  23.39, lon:  113.30, iso: 'CN', continent: 'AS' },
  SZX: { lat:  22.64, lon:  113.81, iso: 'CN', continent: 'AS' },
  CTU: { lat:  30.58, lon:  103.95, iso: 'CN', continent: 'AS' },
  CKG: { lat:  29.72, lon:  106.65, iso: 'CN', continent: 'AS' },
  XIY: { lat:  34.45, lon:  108.76, iso: 'CN', continent: 'AS' },
  HKG: { lat:  22.31, lon:  113.92, iso: 'HK', continent: 'AS' },
  MFM: { lat:  22.15, lon:  113.59, iso: 'MO', continent: 'AS' },
  TPE: { lat:  25.08, lon:  121.23, iso: 'TW', continent: 'AS' },
  SIN: { lat:   1.36, lon:  103.99, iso: 'SG', continent: 'AS' },
  KUL: { lat:   2.75, lon:  101.71, iso: 'MY', continent: 'AS' },
  BKK: { lat:  13.69, lon:  100.75, iso: 'TH', continent: 'AS' },
  DMK: { lat:  13.91, lon:  100.61, iso: 'TH', continent: 'AS' },
  HKT: { lat:   8.11, lon:   98.31, iso: 'TH', continent: 'AS' },
  CGK: { lat:  -6.13, lon:  106.66, iso: 'ID', continent: 'AS' },
  DPS: { lat:  -8.75, lon:  115.17, iso: 'ID', continent: 'AS' },
  MNL: { lat:  14.51, lon:  121.02, iso: 'PH', continent: 'AS' },
  CEB: { lat:  10.31, lon:  123.98, iso: 'PH', continent: 'AS' },
  SGN: { lat:  10.82, lon:  106.65, iso: 'VN', continent: 'AS' },
  HAN: { lat:  21.22, lon:  105.81, iso: 'VN', continent: 'AS' },
  PNH: { lat:  11.55, lon:  104.84, iso: 'KH', continent: 'AS' },
  DEL: { lat:  28.56, lon:   77.10, iso: 'IN', continent: 'AS' },
  BOM: { lat:  19.09, lon:   72.87, iso: 'IN', continent: 'AS' },
  BLR: { lat:  13.20, lon:   77.71, iso: 'IN', continent: 'AS' },
  MAA: { lat:  12.99, lon:   80.17, iso: 'IN', continent: 'AS' },
  HYD: { lat:  17.24, lon:   78.43, iso: 'IN', continent: 'AS' },
  CCU: { lat:  22.65, lon:   88.45, iso: 'IN', continent: 'AS' },
  DXB: { lat:  25.25, lon:   55.36, iso: 'AE', continent: 'AS' },
  AUH: { lat:  24.43, lon:   54.65, iso: 'AE', continent: 'AS' },
  DWC: { lat:  24.89, lon:   55.16, iso: 'AE', continent: 'AS' },
  DOH: { lat:  25.27, lon:   51.61, iso: 'QA', continent: 'AS' },
  KWI: { lat:  29.23, lon:   47.97, iso: 'KW', continent: 'AS' },
  BAH: { lat:  26.27, lon:   50.63, iso: 'BH', continent: 'AS' },
  RUH: { lat:  24.96, lon:   46.70, iso: 'SA', continent: 'AS' },
  JED: { lat:  21.68, lon:   39.16, iso: 'SA', continent: 'AS' },
  MED: { lat:  24.55, lon:   39.71, iso: 'SA', continent: 'AS' },
  MCT: { lat:  23.59, lon:   58.28, iso: 'OM', continent: 'AS' },
  TLV: { lat:  32.01, lon:   34.89, iso: 'IL', continent: 'AS' },
  AMM: { lat:  31.72, lon:   35.99, iso: 'JO', continent: 'AS' },
  BEY: { lat:  33.82, lon:   35.49, iso: 'LB', continent: 'AS' },
  IKA: { lat:  35.42, lon:   51.15, iso: 'IR', continent: 'AS' },
  KHI: { lat:  24.90, lon:   67.17, iso: 'PK', continent: 'AS' },
  ISB: { lat:  33.55, lon:   72.83, iso: 'PK', continent: 'AS' },
  LHE: { lat:  31.52, lon:   74.40, iso: 'PK', continent: 'AS' },
  TAS: { lat:  41.26, lon:   69.28, iso: 'UZ', continent: 'AS' },
  ALA: { lat:  43.35, lon:   77.04, iso: 'KZ', continent: 'AS' },
  CMB: { lat:   7.18, lon:   79.88, iso: 'LK', continent: 'AS' },
  DAC: { lat:  23.84, lon:   90.40, iso: 'BD', continent: 'AS' },
  KTM: { lat:  27.70, lon:   85.36, iso: 'NP', continent: 'AS' },

  // ── Africa ──
  JNB: { lat: -26.14, lon:   28.25, iso: 'ZA', continent: 'AF' },
  CPT: { lat: -33.97, lon:   18.60, iso: 'ZA', continent: 'AF' },
  DUR: { lat: -29.61, lon:   31.12, iso: 'ZA', continent: 'AF' },
  CAI: { lat:  30.12, lon:   31.41, iso: 'EG', continent: 'AF' },
  HRG: { lat:  27.18, lon:   33.80, iso: 'EG', continent: 'AF' },
  LOS: { lat:   6.58, lon:    3.32, iso: 'NG', continent: 'AF' },
  ABV: { lat:   9.01, lon:    7.26, iso: 'NG', continent: 'AF' },
  NBO: { lat:  -1.32, lon:   36.93, iso: 'KE', continent: 'AF' },
  ADD: { lat:   8.98, lon:   38.80, iso: 'ET', continent: 'AF' },
  CMN: { lat:  33.37, lon:   -7.59, iso: 'MA', continent: 'AF' },
  RAK: { lat:  31.61, lon:   -8.04, iso: 'MA', continent: 'AF' },
  ALG: { lat:  36.69, lon:    3.22, iso: 'DZ', continent: 'AF' },
  TUN: { lat:  36.85, lon:   10.23, iso: 'TN', continent: 'AF' },
  DKR: { lat:  14.67, lon:  -17.07, iso: 'SN', continent: 'AF' },
  ACC: { lat:   5.61, lon:   -0.17, iso: 'GH', continent: 'AF' },
  DAR: { lat:  -6.88, lon:   39.20, iso: 'TZ', continent: 'AF' },
  KGL: { lat:  -1.97, lon:   30.13, iso: 'RW', continent: 'AF' },
  EBB: { lat:   0.04, lon:   32.44, iso: 'UG', continent: 'AF' },

  // ── South America ──
  GRU: { lat: -23.44, lon:  -46.47, iso: 'BR', continent: 'SA' },
  CGH: { lat: -23.63, lon:  -46.66, iso: 'BR', continent: 'SA' },
  GIG: { lat: -22.81, lon:  -43.25, iso: 'BR', continent: 'SA' },
  SDU: { lat: -22.91, lon:  -43.16, iso: 'BR', continent: 'SA' },
  BSB: { lat: -15.87, lon:  -47.92, iso: 'BR', continent: 'SA' },
  CNF: { lat: -19.62, lon:  -43.97, iso: 'BR', continent: 'SA' },
  EZE: { lat: -34.82, lon:  -58.54, iso: 'AR', continent: 'SA' },
  AEP: { lat: -34.56, lon:  -58.41, iso: 'AR', continent: 'SA' },
  SCL: { lat: -33.39, lon:  -70.79, iso: 'CL', continent: 'SA' },
  LIM: { lat: -12.02, lon:  -77.11, iso: 'PE', continent: 'SA' },
  BOG: { lat:   4.70, lon:  -74.15, iso: 'CO', continent: 'SA' },
  MDE: { lat:   6.16, lon:  -75.42, iso: 'CO', continent: 'SA' },
  UIO: { lat:  -0.13, lon:  -78.36, iso: 'EC', continent: 'SA' },
  GYE: { lat:  -2.16, lon:  -79.88, iso: 'EC', continent: 'SA' },
  CCS: { lat:  10.60, lon:  -66.99, iso: 'VE', continent: 'SA' },
  MVD: { lat: -34.84, lon:  -56.03, iso: 'UY', continent: 'SA' },
  ASU: { lat: -25.24, lon:  -57.52, iso: 'PY', continent: 'SA' },
  LPB: { lat: -16.51, lon:  -68.18, iso: 'BO', continent: 'SA' },
  PTY: { lat:   9.07, lon:  -79.38, iso: 'PA', continent: 'NA' },
  SJO: { lat:   9.99, lon:  -84.21, iso: 'CR', continent: 'NA' },

  // ── Oceania ──
  SYD: { lat: -33.94, lon:  151.18, iso: 'AU', continent: 'OC' },
  MEL: { lat: -37.67, lon:  144.84, iso: 'AU', continent: 'OC' },
  BNE: { lat: -27.38, lon:  153.12, iso: 'AU', continent: 'OC' },
  PER: { lat: -31.94, lon:  115.97, iso: 'AU', continent: 'OC' },
  ADL: { lat: -34.95, lon:  138.53, iso: 'AU', continent: 'OC' },
  OOL: { lat: -28.16, lon:  153.50, iso: 'AU', continent: 'OC' },
  AKL: { lat: -37.01, lon:  174.79, iso: 'NZ', continent: 'OC' },
  CHC: { lat: -43.49, lon:  172.53, iso: 'NZ', continent: 'OC' },
  WLG: { lat: -41.33, lon:  174.81, iso: 'NZ', continent: 'OC' },
  NAN: { lat: -17.76, lon:  177.44, iso: 'FJ', continent: 'OC' },
  PPT: { lat: -17.55, lon: -149.61, iso: 'PF', continent: 'OC' },
  GUM: { lat:  13.48, lon:  144.80, iso: 'GU', continent: 'OC' },
};

// ── Aircraft type rarity + mission sub-tier ─────────────────────────────────
// Mission sub-tiers categorise the *what's-it-doing-up-there* angle, used as
// extra colour by missionScore on top of classification.

export type MissionSubtier =
  | 'combat'      // fighters / attack
  | 'bomber'      // strategic & tactical bombers
  | 'isr'         // intelligence / surveillance / reconnaissance
  | 'awacs'       // airborne early warning / command
  | 'tanker'      // air-refuelling
  | 'transport'   // strategic & tactical airlift
  | 'mpa'         // maritime patrol
  | 'helo'        // rotary / tiltrotor
  | 'classic'     // vintage / nostalgic
  | 'heavy'       // civilian widebody/cargo iconic
  | 'special';    // experimental / one-off

export interface RareType {
  weight: number;
  reason: string;
  subtier?: MissionSubtier;
}

export const RARE_TYPES: Record<string, RareType> = {
  // ── Civilian heavies / iconic widebodies ──
  A388: { weight: 0.95, reason: 'Airbus A380',              subtier: 'heavy' },
  A124: { weight: 1.00, reason: 'Antonov An-124',           subtier: 'heavy' },
  A225: { weight: 1.00, reason: 'Antonov An-225',           subtier: 'heavy' },
  B741: { weight: 0.70, reason: 'Boeing 747-100',           subtier: 'heavy' },
  B742: { weight: 0.75, reason: 'Boeing 747-200',           subtier: 'heavy' },
  B743: { weight: 0.70, reason: 'Boeing 747-300',           subtier: 'heavy' },
  B744: { weight: 0.55, reason: 'Boeing 747-400',           subtier: 'heavy' },
  B74F: { weight: 0.60, reason: 'Boeing 747-400F',          subtier: 'heavy' },
  B748: { weight: 0.60, reason: 'Boeing 747-8',             subtier: 'heavy' },
  MD11: { weight: 0.65, reason: 'McDonnell Douglas MD-11',  subtier: 'heavy' },
  DC10: { weight: 0.80, reason: 'McDonnell Douglas DC-10',  subtier: 'classic' },
  L101: { weight: 0.90, reason: 'Lockheed L-1011 TriStar',  subtier: 'classic' },
  CONC: { weight: 1.00, reason: 'Concorde',                 subtier: 'classic' },
  IL76: { weight: 0.85, reason: 'Ilyushin Il-76',           subtier: 'heavy' },
  IL96: { weight: 0.85, reason: 'Ilyushin Il-96',           subtier: 'heavy' },
  IL62: { weight: 0.90, reason: 'Ilyushin Il-62',           subtier: 'classic' },
  TU54: { weight: 0.85, reason: 'Tupolev Tu-154',           subtier: 'classic' },
  TU95: { weight: 0.95, reason: 'Tupolev Tu-95 Bear',       subtier: 'bomber' },
  TU16: { weight: 1.00, reason: 'Tupolev Tu-160 Blackjack', subtier: 'bomber' },
  // ── Military: combat ──
  F14:  { weight: 0.85, reason: 'F-14 Tomcat',              subtier: 'combat' },
  F15:  { weight: 0.55, reason: 'F-15 Eagle',               subtier: 'combat' },
  F16:  { weight: 0.45, reason: 'F-16 Fighting Falcon',     subtier: 'combat' },
  F18:  { weight: 0.55, reason: 'F/A-18 Hornet',            subtier: 'combat' },
  FA18: { weight: 0.55, reason: 'F/A-18 Hornet',            subtier: 'combat' },
  F22:  { weight: 0.90, reason: 'F-22 Raptor',              subtier: 'combat' },
  F35:  { weight: 0.70, reason: 'F-35 Lightning II',        subtier: 'combat' },
  A10:  { weight: 0.75, reason: 'A-10 Thunderbolt II',      subtier: 'combat' },
  EF2000:{ weight: 0.65, reason: 'Eurofighter Typhoon',     subtier: 'combat' },
  RAFALE:{ weight: 0.65, reason: 'Dassault Rafale',         subtier: 'combat' },
  TRNADO:{ weight: 0.75, reason: 'Panavia Tornado',         subtier: 'combat' },
  SU27: { weight: 0.85, reason: 'Sukhoi Su-27',             subtier: 'combat' },
  SU30: { weight: 0.85, reason: 'Sukhoi Su-30',             subtier: 'combat' },
  SU34: { weight: 0.90, reason: 'Sukhoi Su-34',             subtier: 'combat' },
  SU35: { weight: 0.90, reason: 'Sukhoi Su-35',             subtier: 'combat' },
  MIG29:{ weight: 0.85, reason: 'MiG-29',                   subtier: 'combat' },
  MIG31:{ weight: 0.95, reason: 'MiG-31',                   subtier: 'combat' },
  // ── Military: strategic bombers ──
  B1:   { weight: 0.85, reason: 'B-1 Lancer',               subtier: 'bomber' },
  B2:   { weight: 1.00, reason: 'B-2 Spirit stealth bomber',subtier: 'bomber' },
  B21:  { weight: 1.00, reason: 'B-21 Raider',              subtier: 'bomber' },
  B52:  { weight: 0.90, reason: 'B-52 Stratofortress',      subtier: 'bomber' },
  // ── Military: ISR / AWACS / command ──
  U2:    { weight: 0.95, reason: 'Lockheed U-2 reconnaissance', subtier: 'isr' },
  RC135: { weight: 0.90, reason: 'Boeing RC-135 SIGINT',        subtier: 'isr' },
  E3CF:  { weight: 0.85, reason: 'E-3 Sentry AWACS',            subtier: 'awacs' },
  E3TF:  { weight: 0.85, reason: 'E-3 Sentry AWACS',            subtier: 'awacs' },
  E4:    { weight: 0.95, reason: 'E-4B Nightwatch',             subtier: 'awacs' },
  E6B:   { weight: 0.90, reason: 'E-6B Mercury TACAMO',         subtier: 'awacs' },
  E8:    { weight: 0.85, reason: 'E-8 Joint STARS',             subtier: 'awacs' },
  // ── Military: maritime patrol ──
  P3:    { weight: 0.65, reason: 'P-3 Orion maritime patrol', subtier: 'mpa' },
  P8:    { weight: 0.55, reason: 'P-8 Poseidon maritime patrol', subtier: 'mpa' },
  // ── Military: tankers ──
  KC135: { weight: 0.50, reason: 'KC-135 Stratotanker',       subtier: 'tanker' },
  KC10:  { weight: 0.70, reason: 'KC-10 Extender',            subtier: 'tanker' },
  KC46:  { weight: 0.55, reason: 'KC-46 Pegasus',             subtier: 'tanker' },
  // ── Military: strategic airlift ──
  C5:    { weight: 0.80, reason: 'C-5 Galaxy',                subtier: 'transport' },
  C5M:   { weight: 0.80, reason: 'C-5M Super Galaxy',         subtier: 'transport' },
  C17:   { weight: 0.55, reason: 'C-17 Globemaster III',      subtier: 'transport' },
  C130:  { weight: 0.45, reason: 'C-130 Hercules',            subtier: 'transport' },
  C130J: { weight: 0.45, reason: 'C-130J Super Hercules',     subtier: 'transport' },
  A400:  { weight: 0.60, reason: 'Airbus A400M Atlas',        subtier: 'transport' },
  // ── Military: rotary / tiltrotor ──
  H64:   { weight: 0.60, reason: 'AH-64 Apache',              subtier: 'helo' },
  V22:   { weight: 0.70, reason: 'V-22 Osprey tiltrotor',     subtier: 'helo' },
  CH47:  { weight: 0.55, reason: 'CH-47 Chinook',             subtier: 'helo' },
  H60:   { weight: 0.45, reason: 'UH-60 Black Hawk',          subtier: 'helo' },
  // ── Old / unusual GA & classics ──
  DC3:  { weight: 0.85, reason: 'Douglas DC-3',             subtier: 'classic' },
  DC6:  { weight: 0.90, reason: 'Douglas DC-6',             subtier: 'classic' },
  CONI: { weight: 0.95, reason: 'Lockheed Constellation',   subtier: 'classic' },
  B17:  { weight: 1.00, reason: 'B-17 Flying Fortress',     subtier: 'classic' },
  B29:  { weight: 1.00, reason: 'B-29 Superfortress',       subtier: 'classic' },
  P51:  { weight: 0.90, reason: 'P-51 Mustang',             subtier: 'classic' },
  SPIT: { weight: 1.00, reason: 'Supermarine Spitfire',     subtier: 'classic' },
};

// ── VIP / head-of-state callsign patterns ───────────────────────────────────
// Matched as RegExp against the uppercased, trimmed callsign. First match wins.

export interface VipCallsign {
  pattern: RegExp;
  weight: number;
  reason: string;
}

export const VIP_CALLSIGN_PATTERNS: VipCallsign[] = [
  // US — Presidential / Vice-Presidential / VIP
  { pattern: /^AF1\b/,        weight: 1.0, reason: 'Air Force One' },
  { pattern: /^AF2\b/,        weight: 1.0, reason: 'Air Force Two' },
  { pattern: /^EXEC1\b/,      weight: 1.0, reason: 'EXEC1 — Presidential' },
  { pattern: /^EXEC1F\b/,     weight: 1.0, reason: 'EXEC1F — VIP support' },
  { pattern: /^EXEC2\b/,      weight: 0.9, reason: 'EXEC2 — VIP' },
  { pattern: /^SAM\d/,        weight: 0.9, reason: 'SAM — Special Air Mission' },
  { pattern: /^VC25/,         weight: 1.0, reason: 'VC-25 Air Force One airframe' },
  { pattern: /^VENUS\d?/,     weight: 0.9, reason: 'VENUS — VIP transport' },
  // UK
  { pattern: /^KRF\d/,        weight: 0.9, reason: 'Kittyhawk Royal Flight' },
  { pattern: /^ROF\d/,        weight: 1.0, reason: 'Royal Flight (UK)' },
  { pattern: /^TQF\d/,        weight: 0.9, reason: 'Royal Flight (UK)' },
  // Germany
  { pattern: /^GAF\d/,        weight: 0.9, reason: 'GAF — German Air Force VIP' },
  // France
  { pattern: /^COTAM\d/,      weight: 0.9, reason: 'COTAM — French government' },
  { pattern: /^FAF\d/,        weight: 0.7, reason: 'FAF — Armée de l’Air' },
  // Canada
  { pattern: /^CFC\d/,        weight: 0.9, reason: 'CFC — Canadian VIP transport' },
  // Italy
  { pattern: /^IAM\d/,        weight: 0.9, reason: 'IAM — Italian government' },
  // Russia
  { pattern: /^RSD\d/,        weight: 0.9, reason: 'RSD — Russian VIP transport' },
  // Generic medical
  { pattern: /LIFEGUARD/,     weight: 0.8, reason: 'Lifeguard flight' },
  { pattern: /MEDEVAC/,       weight: 0.8, reason: 'MEDEVAC' },
  { pattern: /^MEDIC\d/,      weight: 0.7, reason: 'Medical transport' },
  // Generic search & rescue
  { pattern: /RESCUE\d?/,     weight: 0.7, reason: 'Search & rescue' },
  { pattern: /COASTGUARD/,    weight: 0.6, reason: 'Coast Guard' },
];

// ── Head-of-state / VIP / classified ICAO hex prefixes ──────────────────────
// Hex codes from adsb.lol are lowercased by adsb.lol but normalise both sides.
// Match is "code starts with the prefix" — short prefixes catch entire blocks.

export interface VipHexBlock {
  prefix: string;       // case-insensitive
  weight: number;
  reason: string;
}

export const VIP_HEX_PREFIXES: VipHexBlock[] = [
  // US Air Force One / VIP airframes (VC-25A, C-32, C-37, C-40)
  { prefix: 'adfdf8', weight: 1.0, reason: 'VC-25 (Air Force One)' },
  { prefix: 'adfdf9', weight: 1.0, reason: 'VC-25 (Air Force One)' },
  // E-4B Nightwatch fleet
  { prefix: 'ae0163', weight: 1.0, reason: 'E-4B Nightwatch' },
  { prefix: 'ae0164', weight: 1.0, reason: 'E-4B Nightwatch' },
  { prefix: 'ae0165', weight: 1.0, reason: 'E-4B Nightwatch' },
  { prefix: 'ae0166', weight: 1.0, reason: 'E-4B Nightwatch' },
  // UK Royal Flight (32 Sqn RAF)
  { prefix: '43c0',   weight: 0.5, reason: 'UK military block' },
  // Russian VIP / Rossiya Special Flight Detachment
  { prefix: '15000',  weight: 0.6, reason: 'Russian government' },
  // German government
  { prefix: '3c4',    weight: 0.4, reason: 'German military block' },
  // Many more exist; this is intentionally a small high-confidence set.
];

// ── Geo helpers ─────────────────────────────────────────────────────────────

/**
 * Great-circle distance between two airport coords, in nautical miles.
 * Uses the haversine formula. Returns null if either coord is missing.
 */
export function greatCircleNm(
  a: AirportCoord | undefined,
  b: AirportCoord | undefined,
): number | null {
  if (!a || !b) return null;
  const R_NM = 3440.065; // mean Earth radius in nautical miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lookupAirport(iata: string | null): AirportCoord | undefined {
  if (!iata) return undefined;
  return AIRPORT_COORDS[iata.toUpperCase()];
}

export function lookupVipHex(hex: string | null): VipHexBlock | null {
  if (!hex) return null;
  const lower = hex.toLowerCase();
  for (const b of VIP_HEX_PREFIXES) {
    if (lower.startsWith(b.prefix)) return b;
  }
  return null;
}

export function lookupVipCallsign(callsign: string | null): VipCallsign | null {
  if (!callsign) return null;
  const cs = callsign.toUpperCase().trim();
  for (const p of VIP_CALLSIGN_PATTERNS) {
    if (p.pattern.test(cs)) return p;
  }
  return null;
}
