import type { Classification, InterestComponents, InterestTier } from '../types/flight';
import {
  RARE_TYPES,
  greatCircleNm,
  lookupAirport,
  lookupVipCallsign,
  lookupVipHex,
  type MissionSubtier,
  type RareType,
} from './referenceData';

// ─────────────────────────────────────────────────────────────────────────────
// Interest scoring — Phase 2
//
// Pure, deterministic function. Each component is a 0..1 normalised sub-score.
// The total is a weighted sum capped at 100, with the contributing reasons
// returned alongside so the UI can explain *why* a flight is interesting.
// ─────────────────────────────────────────────────────────────────────────────

// Weights chosen so each *dominant* single signal lands in its natural tier:
//   squawk 7700 alone   → ~80   (rare)
//   B-2 / VC-25 / B-2   → ~78   (rare, rarity + mission compound)
//   orbit / hold        → ~35   (noteworthy alone — usually compounds)
//   F-22 / F-35         → 70+   (interesting / rare edge)
//   F-16 / Su-30        → ~50   (interesting)
//   JFK → HKG           → ~30   (noteworthy, route alone)
// The raw sum is clamped to 100 so compound signals naturally pile up.
const WEIGHTS = {
  emergency:  80,
  mission:    40,
  rarity:     40,
  kinematic:  35,
  route:      30,
  trajectory: 35,
  firstSeen:  25,
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

// Mission sub-tier → base score and prefix used in the reason string.
// Combat aircraft and strategic bombers score highest on the mission axis;
// transport / helo are floors above plain "military".
const SUBTIER_SCORE: Record<MissionSubtier, { value: number; label: string }> = {
  combat:    { value: 0.85, label: 'Combat aircraft' },
  bomber:    { value: 0.95, label: 'Strategic bomber' },
  isr:       { value: 0.90, label: 'ISR / reconnaissance' },
  awacs:     { value: 0.85, label: 'Airborne early warning / command' },
  tanker:    { value: 0.70, label: 'Air-refuelling tanker' },
  transport: { value: 0.55, label: 'Military airlift' },
  mpa:       { value: 0.60, label: 'Maritime patrol' },
  helo:      { value: 0.50, label: 'Military rotary / tiltrotor' },
  classic:   { value: 0.85, label: 'Vintage aircraft' },
  heavy:     { value: 0.40, label: 'Iconic widebody' },
  special:   { value: 0.80, label: 'Special-use aircraft' },
};

// Mission weight by VIP / sub-tier / classification fallback.
function missionScore(opts: {
  classification: Classification;
  callsign: string | null;
  hex: string | null;
  rareType: RareType | undefined;
}): { value: number; reason: string | null } {
  // VIP / head-of-state — hex blocks take priority (most reliable)
  const vipHex = lookupVipHex(opts.hex);
  if (vipHex) return { value: vipHex.weight, reason: `VIP airframe — ${vipHex.reason}` };

  // VIP callsign patterns
  const vipCs = lookupVipCallsign(opts.callsign);
  if (vipCs) return { value: vipCs.weight, reason: vipCs.reason };

  // Sub-tier from the rare-types table
  if (opts.rareType?.subtier) {
    const t = SUBTIER_SCORE[opts.rareType.subtier];
    return { value: t.value, reason: t.label };
  }

  // Plain classification fallback
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

// Route signals — long-haul, ultra-long-haul, cross-continent.
// Returns 0 when either airport coord is unknown or the route is intra-continent
// short-haul. Compound signals (long-haul + cross-continent) accumulate, capped
// at 1.0.
function routeScore(opts: {
  originIata: string | null;
  destinationIata: string | null;
}): { value: number; reasons: string[] } {
  const origin = lookupAirport(opts.originIata);
  const dest   = lookupAirport(opts.destinationIata);
  if (!origin || !dest) return { value: 0, reasons: [] };

  const reasons: string[] = [];
  let v = 0;

  const dist = greatCircleNm(origin, dest);
  if (dist != null) {
    if (dist >= 6500) {
      v = Math.max(v, 0.85);
      reasons.push(`Ultra-long-haul route (${Math.round(dist).toLocaleString()} nm)`);
    } else if (dist >= 4000) {
      v = Math.max(v, 0.55);
      reasons.push(`Long-haul route (${Math.round(dist).toLocaleString()} nm)`);
    } else if (dist >= 2500) {
      v = Math.max(v, 0.25);
      reasons.push(`Medium-haul route (${Math.round(dist).toLocaleString()} nm)`);
    }
  }

  if (origin.continent !== dest.continent) {
    // Slight bump on top of distance. Trans-Pacific / trans-Atlantic / etc.
    v = Math.min(1.0, v + 0.2);
    reasons.push(`Cross-continent (${origin.continent} → ${dest.continent})`);
  }

  return { value: v, reasons };
}

export interface ScoreInputs {
  classification: Classification;
  hex: string | null;
  callsign: string | null;
  typeCode: string | null;
  originIata: string | null;
  destinationIata: string | null;
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
  personalRouteSightings: number | null;  // null = no route data
  isFirstHexForUser: boolean;
  isFirstTypeForUser: boolean;
  isFirstOperatorForUser: boolean;
  isFirstRouteForUser: boolean;
  // Trajectory analysis (caller pulls track + runs analyseTrajectory)
  trajectoryScore: number;       // 0..1
  trajectoryReasons: string[];   // pre-rendered reason strings
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

  // ── Rarity (aircraft type, global + personal + mlat) ─────────────────────
  let rarity = 0;
  const tc = (inp.typeCode ?? '').toUpperCase();
  const rareType = tc ? RARE_TYPES[tc] : undefined;
  if (rareType) {
    rarity = Math.max(rarity, rareType.weight);
    reasons.push(`Rare type: ${rareType.reason}`);
  }
  if (inp.personalTypeSightings != null) {
    if (inp.personalTypeSightings === 0) {
      rarity = Math.max(rarity, 0.6);
      // first-seen reason is added below
    } else if (inp.personalTypeSightings < 3) {
      rarity = Math.max(rarity, 0.35);
      reasons.push(`Uncommon for you (seen ${inp.personalTypeSightings}× before)`);
    }
  }
  if (inp.mlat) {
    rarity = Math.max(rarity, 0.3);
    reasons.push('MLAT-only (no ADS-B Out)');
  }
  // VIP hex match — the airframe itself is rare (single-tail or limited fleet).
  // missionScore reads the same lookup separately for its own purposes.
  const vipHex = lookupVipHex(inp.hex);
  if (vipHex) rarity = Math.max(rarity, vipHex.weight);

  // ── Mission ──────────────────────────────────────────────────────────────
  const mission = missionScore({
    classification: inp.classification,
    callsign:       inp.callsign,
    hex:            inp.hex,
    rareType,
  });
  if (mission.reason) reasons.push(mission.reason);

  // ── Kinematic ────────────────────────────────────────────────────────────
  const kin = kinematicScore({
    altitudeFt:  inp.altitudeFt,
    speedKts:    inp.speedKts,
    baroRateFpm: inp.baroRateFpm,
    distanceNm:  inp.distanceNm,
    category:    inp.category,
  });
  reasons.push(...kin.reasons);

  // ── Route ────────────────────────────────────────────────────────────────
  const route = routeScore({
    originIata:      inp.originIata,
    destinationIata: inp.destinationIata,
  });
  reasons.push(...route.reasons);

  // ── Trajectory ───────────────────────────────────────────────────────────
  // Computed by the caller from the flight's recent track. The reasons are
  // already rendered (e.g. "Orbiting / loitering", "Off-route by 137 nm").
  const trajectory = Math.max(0, Math.min(1, inp.trajectoryScore));
  reasons.push(...inp.trajectoryReasons);

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
  if (inp.isFirstRouteForUser && inp.originIata && inp.destinationIata) {
    firstSeen = Math.max(firstSeen, 0.5);
    reasons.push(`First ${inp.originIata} → ${inp.destinationIata} flight you’ve seen`);
  } else if (inp.personalRouteSightings != null && inp.personalRouteSightings > 0
             && inp.personalRouteSightings < 3) {
    firstSeen = Math.max(firstSeen, 0.3);
  }

  const components: InterestComponents = {
    emergency,
    mission: mission.value,
    rarity,
    kinematic: kin.value,
    route: route.value,
    trajectory,
    firstSeen,
  };

  const raw =
      WEIGHTS.emergency  * components.emergency
    + WEIGHTS.mission    * components.mission
    + WEIGHTS.rarity     * components.rarity
    + WEIGHTS.kinematic  * components.kinematic
    + WEIGHTS.route      * components.route
    + WEIGHTS.trajectory * components.trajectory
    + WEIGHTS.firstSeen  * components.firstSeen;

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const tier  = tierFor(score);

  // Top 4 reasons, preserving dominant signals first.
  const trimmed = reasons.slice(0, 4);

  return { score, tier, reasons: trimmed, components };
}
