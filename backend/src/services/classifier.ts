import type { Classification } from '../types/flight';

// ── Military callsign prefixes ──────────────────────────────────────────────
// These are official/well-documented military callsign prefixes.
// Checked against the uppercased, trimmed callsign.
const MILITARY_CALLSIGN_PREFIXES = [
  // US Air Force / Air Mobility Command
  'RCH', 'REACH', 'SAM', 'SPAR', 'EVAC',
  // US classified / special programmes
  'JANET',
  // US Navy / Coast Guard
  'NAVY', 'CUTTER',
  // Patient air transport (USAF 89th AW)
  'PAT',
  // Generic USAF-labelled flights
  'USAF',
  // Common NATO / multinational exercise patterns
  'NATO',
  // UK Royal Air Force
  'RRR',
  // USMC
  'VMGR', 'VMR',
  // Special operations / exercise callsigns (well-documented)
  'TOPCAT', 'MAGMA',
];

// ── Military-only ICAO aircraft type codes ──────────────────────────────────
// Only codes that are overwhelmingly (or exclusively) operated by military.
const MILITARY_TYPE_CODES = new Set([
  // Fighters / attack
  'F14', 'F15', 'F16', 'F18', 'FA18', 'F22', 'F35', 'A10', 'SU27', 'SU30',
  'SU34', 'SU35', 'MIG29', 'MIG31', 'EF2000', 'TRNADO', 'RAFALE',
  // Bombers
  'B1',  'B2',  'B52', 'B21',
  // Tankers
  'KC135', 'KC10', 'KC46',
  // Airborne command / early warning
  'E3CF', 'E3TF', 'E4',  'E6B', 'E8',
  // Maritime patrol / recon
  'P3',  'P8',  'RC135', 'U2',
  // Military transport (primarily military; some civilian C-130s exist so excluded)
  'C17', 'C5M', 'C5',
  // Military rotary
  'H64', 'V22',
]);

// ── Government keywords ──────────────────────────────────────────────────────
// Matched as whole words against the operator/owner. Word-boundary matching is
// required: a plain substring check incorrectly flags "EnDEAvor" (Endeavor Air,
// a Delta Connection regional) on "dea", and any commercial "Royal *" airline
// (Royal Brunei, Royal Air Maroc, Royal Jordanian) on "royal".
const GOVERNMENT_KEYWORDS = [
  // Military branches (generic)
  'air force', 'navy', 'army', 'military', 'marine corps', 'marines',
  'coast guard', 'uscg', 'national guard',
  // Law enforcement / border
  'police', 'sheriff', 'state police', 'highway patrol',
  'customs', 'border patrol', 'border force',
  // Federal / national agencies
  'government', 'federal', 'homeland security',
  'nasa', 'fbi', 'dea', 'atf', 'secret service',
  'transportation security',
  // International government patterns
  'ministry', 'ministere', 'ministerio', 'ministerium',
  'republic of', 'kingdom of', 'department of',
  'bundeswehr', 'bundespolizei', 'gendarm',
  'guardia civil', 'carabinieri',
  // Royal armed forces (deliberately specific — bare "royal" matches commercial
  // carriers like Royal Brunei, Royal Air Maroc, Royal Jordanian).
  'royal air force', 'royal navy',
  'royal australian air force', 'royal canadian air force',
  'royal new zealand air force', 'royal saudi air force',
  'royal thai air force', 'royal malaysian air force',
  'royal netherlands air force', 'royal danish air force',
  'royal norwegian air force', 'royal swedish air force',
];

// ── Cargo operator keywords ──────────────────────────────────────────────────
const CARGO_KEYWORDS = [
  // Cargo / freight in name
  'cargo', 'freight', 'logistics',
  // Major integrators
  'fedex', 'ups', 'dhl', 'tnt',
  // Known pure-cargo carriers
  'atlas air', 'kalitta', 'abx', 'air transport', 'polar air',
  'cargolux', 'aerologic', 'air bridge cargo', 'abc cargo',
  'western global', 'titan air', 'global air cargo', 'florida west',
  'silk way', 'qantas freight', 'lufthansa cargo', 'turkish cargo',
  'air france cargo', 'korean air cargo', 'mahan air',
  // Amazon / e-commerce air arms
  'amazon air', 'prime air',
  // Regional/niche freighters
  'airbridge', 'astral aviation', 'sky lease',
];

// ── Cargo-only (or predominantly cargo) ICAO type codes ─────────────────────
const CARGO_TYPE_CODES = new Set([
  // Boeing widebody freighters
  'B744', 'B74F', 'B748', 'B748F',
  'B762', 'B763', 'B764',
  'B77F', 'B77L',
  // Airbus widebody freighters
  'A30B', 'A306', 'A332',
  // McDonnell Douglas
  'DC8',  'DC85', 'DC86', 'DC87',
  'DC10', 'MD11',
  // Russian / former-Soviet freighters
  'IL76', 'IL76T', 'AN12', 'AN24', 'AN26', 'AN72', 'AN124', 'AN225',
  // Narrowbody freighters
  'B752', 'B721', 'B722',
]);

// ── Private owner patterns ───────────────────────────────────────────────────
// Tested on lowercased owner when no airline operator is present.
// Word-boundary anchors prevent false substring matches.
const PRIVATE_PATTERNS = [
  /\bllc\b/i,
  /\binc\b/i,
  /\bltd\b/i,
  /\blimited\b/i,
  /\bcorp\b/i,
  /\btrust\b/i,
  /\bholdings?\b/i,
  /\bleasing\b/i,
  /\bventures?\b/i,
  /\bpartners\b/i,
  /\bgroup\b/i,
  /\benterprises?\b/i,
  /\bproperties\b/i,
];

// ── Main classifier ──────────────────────────────────────────────────────────

// Build one alternation regex per keyword list, anchored on word boundaries so
// short tokens (dea, fbi, ups, …) only match standalone words rather than
// random substrings inside operator names.
function buildKeywordRegex(keywords: readonly string[]): RegExp {
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}

const GOVERNMENT_RE = buildKeywordRegex(GOVERNMENT_KEYWORDS);
const CARGO_RE      = buildKeywordRegex(CARGO_KEYWORDS);

export function classify(params: {
  callsign: string | null;
  operator: string | null;
  owner: string | null;
  typeCode: string | null;
}): Classification {
  const { callsign, operator, owner, typeCode } = params;
  const cs = (callsign ?? '').toUpperCase().trim();
  const op = (operator ?? '').toLowerCase();
  const ow = (owner ?? '').toLowerCase();
  const tc = (typeCode ?? '').toUpperCase().trim();

  // ── 1. Military — callsign prefix (most reliable signal) ──────────────────
  if (cs && MILITARY_CALLSIGN_PREFIXES.some((p) => cs.startsWith(p))) return 'military';

  // ── 2. Military — ICAO type code (unambiguous military-only aircraft) ─────
  if (tc && MILITARY_TYPE_CODES.has(tc)) return 'military';

  // ── 3. Government — keyword in operator or owner ──────────────────────────
  if ((op && GOVERNMENT_RE.test(op)) || (ow && GOVERNMENT_RE.test(ow))) return 'government';

  // ── 4. Cargo — keyword in operator or owner ───────────────────────────────
  if ((op && CARGO_RE.test(op)) || (ow && CARGO_RE.test(ow))) return 'cargo';

  // ── 5. Cargo — ICAO type code ─────────────────────────────────────────────
  if (tc && CARGO_TYPE_CODES.has(tc)) return 'cargo';

  // ── 6. Commercial — has a named airline operator ──────────────────────────
  if (operator && operator.trim().length > 0) return 'commercial';

  // ── 7. Private — owner name matches a holding/LLC pattern ─────────────────
  if (ow && PRIVATE_PATTERNS.some((re) => re.test(ow))) return 'private';

  return 'unknown';
}
