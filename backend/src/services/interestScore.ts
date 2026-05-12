import type { Classification, InterestComponents, InterestTier } from '../types/flight';

// ─────────────────────────────────────────────────────────────────────────────
// Interest scoring — Phase 1
//
// Pure, deterministic function. Each component is a 0..1 normalised sub-score.
// The total is a weighted sum capped at 100, with the contributing reasons
// returned alongside so the UI can explain *why* a flight is interesting.
//
// Weights are tuned so a single dominant signal (e.g. squawk 7700) is enough
// to push a flight into the "rare" tier (>= 75), while a mix of weaker
// signals (rare type + first-seen + low altitude) still gets surfaced.
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  emergency: 35,
  mission:   15,
  rarity:    15,
  kinematic: 10,
  firstSeen:  5,
  // route component is folded into rarity for Phase 1 (no airport coord table yet)
} as const;

const TIER_THRESHOLDS: { tier: InterestTier; min: number }[] = [
  { tier: 'rare',         min: 75 },
  { tier: 'interesting',  min: 50 },
  { tier: 'noteworthy',   min: 25 },
  { tier: 'routine',      min: 0  },
];

export function tierFor(score: number): InterestTier {
  for (const t of TIER_THRESHOLDS) if (score >= t.min) return t.tier;
  return 'routine';
}

// Emergency squawks (ICAO standard, region-independent)
const SQUAWK_EMERGENCY: Record<string, { weight: number; reason: string }> = {
  '7500': { weight: 1.0, reason: 'Squawk 7500 — unlawful interference (hijack)' },
  '7600': { weight: 1.0, reason: 'Squawk 7600 — radio failure' },
  '7700': { weight: 1.0, reason: 'Squawk 7700 — general emergency' },
  '7777': { weight: 0.9, reason: 'Squawk 7777 — military intercept' },
};

// ADS-B "emergency" enum values from the dump1090 / readsb family
const EMERGENCY_ENUM: Record<string, { weight: number; reason: string }> = {
  general:   { weight: 1.0, reason: 'Emergency declared (general)' },
  lifeguard: { weight: 0.9, reason: 'Lifeguard / MEDEVAC flight' },
  minfuel:   { weight: 0.8, reason: 'Minimum fuel declared' },
  nordo:     { weight: 0.7, reason: 'NORDO — no radio' },
  unlawful:  { weight: 1.0, reason: 'Unlawful interference declared' },
  downed:    { weight: 1.0, reason: 'Aircraft downed' },
};

// Aircraft type rarity — global, rough hand-tuned weights.
// 0.5 = uncommon, 0.8 = rare, 1.0 = wow-that's-that-thing tier.
const RARE_TYPES: Record<string, { weight: number; reason: string }> = {
  // Heavy / iconic
  A388: { weight: 0.95, reason: 'Airbus A380' },
  A124: { weight: 1.00, reason: 'Antonov An-124' },
  A225: { weight: 1.00, reason: 'Antonov An-225' },
  B741: { weight: 0.70, reason: 'Boeing 747-100' },
  B742: { weight: 0.75, reason: 'Boeing 747-200' },
  B743: { weight: 0.70, reason: 'Boeing 747-300' },
  B744: { weight: 0.55, reason: 'Boeing 747-400' },
  B748: { weight: 0.60, reason: 'Boeing 747-8' },
  MD11: { weight: 0.65, reason: 'McDonnell Douglas MD-11' },
  DC10: { weight: 0.80, reason: 'McDonnell Douglas DC-10' },
  L101: { weight: 0.90, reason: 'Lockheed L-1011 TriStar' },
  CONC: { weight: 1.00, reason: 'Concorde' }, // here for completeness
  IL76: { weight: 0.85, reason: 'Ilyushin Il-76' },
  IL96: { weight: 0.85, reason: 'Ilyushin Il-96' },
  TU54: { weight: 0.80, reason: 'Tupolev Tu-154' },
  TU95: { weight: 0.95, reason: 'Tupolev Tu-95 Bear' },
  // Military intel / special use (additive to mission, but stand-alone rare)
  U2:   { weight: 0.95, reason: 'Lockheed U-2 reconnaissance' },
  RC135:{ weight: 0.90, reason: 'Boeing RC-135 SIGINT' },
  E3CF: { weight: 0.85, reason: 'E-3 Sentry AWACS' },
  E3TF: { weight: 0.85, reason: 'E-3 Sentry AWACS' },
  E4:   { weight: 0.95, reason: 'E-4B Nightwatch' },
  E6B:  { weight: 0.90, reason: 'E-6B Mercury TACAMO' },
  E8:   { weight: 0.85, reason: 'E-8 Joint STARS' },
  P3:   { weight: 0.65, reason: 'P-3 Orion maritime patrol' },
  P8:   { weight: 0.55, reason: 'P-8 Poseidon maritime patrol' },
  B52:  { weight: 0.90, reason: 'B-52 Stratofortress' },
  B1:   { weight: 0.85, reason: 'B-1 Lancer' },
  B2:   { weight: 1.00, reason: 'B-2 Spirit stealth bomber' },
  B21:  { weight: 1.00, reason: 'B-21 Raider' },
  V22:  { weight: 0.70, reason: 'V-22 Osprey tiltrotor' },
  C5:   { weight: 0.80, reason: 'C-5 Galaxy' },
  C5M:  { weight: 0.80, reason: 'C-5M Super Galaxy' },
  // Old / unusual GA & classics
  DC3:  { weight: 0.85, reason: 'Douglas DC-3' },
  DC6:  { weight: 0.90, reason: 'Douglas DC-6' },
  CONI: { weight: 0.95, reason: 'Lockheed Constellation' },
};

// Mission weight by classification + sub-signals.
function missionScore(opts: {
  classification: Classification;
  callsign: string | null;
  typeCode: string | null;
  emergency: string | null;
}): { value: number; reason: string | null } {
  const cs = (opts.callsign ?? '').toUpperCase();
  const tc = (opts.typeCode ?? '').toUpperCase();

  // Head-of-state / VIP callsigns (subset; expand in Tier 2)
  if (/^(AF1|AF2|SAM\d|EXEC1F|VENUS\d?|GAF\d|CFC\d|ROF\d|VC25)/.test(cs)) {
    return { value: 1.0, reason: `VIP / head-of-state callsign (${cs})` };
  }
  // Lifeguard / medevac — caught by emergency too, but works on callsign suffix
  if (/LIFEGUARD|MEDEVAC|MEDIC/.test(cs)) {
    return { value: 0.7, reason: 'Lifeguard / MEDEVAC mission' };
  }
  // Air refuelling tankers
  if (/^(KC135|KC10|KC46)/.test(tc)) {
    return { value: 0.7, reason: 'Air-refuelling tanker' };
  }
  // Fighters / bombers / stealth — already weighted via rarity but mission-flag too
  if (/^(F14|F15|F16|F18|FA18|F22|F35|A10|B1|B2|B21|B52|SU2|SU3|MIG)/.test(tc)) {
    return { value: 0.8, reason: 'Combat aircraft' };
  }
  if (opts.classification === 'military')   return { value: 0.6, reason: 'Military flight' };
  if (opts.classification === 'government') return { value: 0.5, reason: 'Government flight' };
  return { value: 0, reason: null };
}

// Kinematic anomaly — altitude/speed/vertical-rate signals.
function kinematicScore(opts: {
  altitudeFt: number | null;
  speedKts:   number | null;
  baroRateFpm: number | null;
  distanceNm: number | null;
  category:   string | null;
}): { value: number; reasons: string[] } {
  const { altitudeFt, speedKts, baroRateFpm, distanceNm, category } = opts;
  let v = 0;
  const reasons: string[] = [];

  // Rotorcraft / UAV / glider — category is its own flag
  if (category === 'A7')      { v = Math.max(v, 0.5); reasons.push('Rotorcraft'); }
  else if (category === 'B6') { v = Math.max(v, 0.9); reasons.push('Unmanned aircraft (UAV)'); }
  else if (category === 'B1') { v = Math.max(v, 0.7); reasons.push('Glider'); }
  else if (category === 'B2') { v = Math.max(v, 0.8); reasons.push('Lighter-than-air'); }
  else if (category === 'B4') { v = Math.max(v, 0.9); reasons.push('Ultralight'); }

  // Very low overhead — alt low *and* observer close
  if (altitudeFt != null && altitudeFt > 0 && altitudeFt < 2000
      && distanceNm != null && distanceNm < 3) {
    v = Math.max(v, 0.8);
    reasons.push(`Low overhead — ${altitudeFt} ft at ${distanceNm.toFixed(1)} nm`);
  } else if (altitudeFt != null && altitudeFt > 0 && altitudeFt < 1000) {
    v = Math.max(v, 0.5);
    reasons.push(`Low altitude (${altitudeFt} ft)`);
  }

  // Very high altitude — typical airliner ceiling ~ FL410; >= 45k is unusual
  if (altitudeFt != null && altitudeFt >= 45000) {
    v = Math.max(v, 0.7);
    reasons.push(`Very high altitude (${altitudeFt} ft)`);
  }

  // Rapid descent — > 3000 fpm sustained
  if (baroRateFpm != null && baroRateFpm <= -3000) {
    v = Math.max(v, 0.8);
    reasons.push(`Rapid descent (${baroRateFpm} ft/min)`);
  }
  // Steep climb — > 4000 fpm is unusual for transport-cat aircraft
  if (baroRateFpm != null && baroRateFpm >= 4000) {
    v = Math.max(v, 0.5);
    reasons.push(`Steep climb (${baroRateFpm} ft/min)`);
  }

  // Supersonic on a non-military scan — military will already be scored elsewhere
  if (speedKts != null && speedKts >= 600) {
    v = Math.max(v, 0.7);
    reasons.push(`Supersonic ground speed (${speedKts} kts)`);
  }

  // Hover / stationary — likely heli or balloon
  if (speedKts != null && speedKts < 30
      && altitudeFt != null && altitudeFt > 100) {
    v = Math.max(v, 0.4);
    reasons.push(`Near-stationary (${speedKts} kts)`);
  }

  return { value: v, reasons };
}

export interface ScoreInputs {
  classification: Classification;
  callsign: string | null;
  typeCode: string | null;
  altitudeFt: number | null;
  speedKts: number | null;
  baroRateFpm: number | null;
  distanceNm: number | null;
  category: string | null;
  squawk: string | null;
  emergency: string | null;
  mlat: boolean;
  // Personal rarity inputs (computed by caller from DB)
  personalTypeSightings: number | null;   // null = unknown type
  isFirstHexForUser: boolean;
  isFirstTypeForUser: boolean;
  isFirstOperatorForUser: boolean;
}

export interface ScoreResult {
  score: number;
  tier: InterestTier;
  reasons: string[];
  components: InterestComponents;
}

export function scoreFlight(inp: ScoreInputs): ScoreResult {
  const reasons: string[] = [];

  // ── Emergency ────────────────────────────────────────────────────────────
  let emergency = 0;
  if (inp.squawk && SQUAWK_EMERGENCY[inp.squawk]) {
    const e = SQUAWK_EMERGENCY[inp.squawk];
    emergency = Math.max(emergency, e.weight);
    reasons.push(e.reason);
  }
  if (inp.emergency && inp.emergency !== 'none' && EMERGENCY_ENUM[inp.emergency]) {
    const e = EMERGENCY_ENUM[inp.emergency];
    emergency = Math.max(emergency, e.weight);
    reasons.push(e.reason);
  }

  // ── Mission ──────────────────────────────────────────────────────────────
  const mission = missionScore({
    classification: inp.classification,
    callsign:       inp.callsign,
    typeCode:       inp.typeCode,
    emergency:      inp.emergency,
  });
  if (mission.reason) reasons.push(mission.reason);

  // ── Rarity (aircraft type, global + personal) ────────────────────────────
  let rarity = 0;
  const tc = (inp.typeCode ?? '').toUpperCase();
  if (tc && RARE_TYPES[tc]) {
    rarity = Math.max(rarity, RARE_TYPES[tc].weight);
    reasons.push(`Rare type: ${RARE_TYPES[tc].reason}`);
  }
  // Personal rarity: first time you've seen this type counts; <3 sightings still novel.
  if (inp.personalTypeSightings != null) {
    if (inp.personalTypeSightings === 0) {
      rarity = Math.max(rarity, 0.6);
      // covered by firstSeen reason below if isFirstTypeForUser
    } else if (inp.personalTypeSightings < 3) {
      rarity = Math.max(rarity, 0.35);
      reasons.push(`Uncommon for you (seen ${inp.personalTypeSightings}× before)`);
    }
  }
  // MLAT-only = no ADS-B = older / non-cooperative
  if (inp.mlat) {
    rarity = Math.max(rarity, 0.3);
    reasons.push('MLAT-only (no ADS-B Out)');
  }

  // ── Kinematic ────────────────────────────────────────────────────────────
  const kin = kinematicScore({
    altitudeFt:  inp.altitudeFt,
    speedKts:    inp.speedKts,
    baroRateFpm: inp.baroRateFpm,
    distanceNm:  inp.distanceNm,
    category:    inp.category,
  });
  reasons.push(...kin.reasons);

  // ── First-seen ───────────────────────────────────────────────────────────
  let firstSeen = 0;
  if (inp.isFirstHexForUser) {
    firstSeen = Math.max(firstSeen, 0.5);
    reasons.push('First time you’ve seen this airframe');
  }
  if (inp.isFirstTypeForUser && inp.typeCode) {
    firstSeen = 1.0;
    reasons.push(`First ${inp.typeCode} you’ve seen`);
  }
  if (inp.isFirstOperatorForUser) {
    firstSeen = Math.max(firstSeen, 0.6);
    reasons.push('First sighting from this operator');
  }

  const components: InterestComponents = {
    emergency,
    mission: mission.value,
    rarity,
    kinematic: kin.value,
    firstSeen,
  };

  const raw =
      WEIGHTS.emergency * components.emergency
    + WEIGHTS.mission   * components.mission
    + WEIGHTS.rarity    * components.rarity
    + WEIGHTS.kinematic * components.kinematic
    + WEIGHTS.firstSeen * components.firstSeen;

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const tier  = tierFor(score);

  // Top 4 reasons, preserving dominant signals first.
  const trimmed = reasons.slice(0, 4);

  return { score, tier, reasons: trimmed, components };
}
