import type { Classification } from '../types/flight';

// Phase 3: full classification engine
// Priority: government/military > commercial > cargo > private > unknown

const MILITARY_CALLSIGN_PREFIXES = ['RCH', 'SAM', 'SPAR', 'REACH', 'EVAC', 'JANET'];

const GOVERNMENT_KEYWORDS = [
  'air force', 'navy', 'army', 'military', 'government', 'federal',
  'coast guard', 'customs', 'border patrol', 'police', 'uscg',
];

const CARGO_KEYWORDS = [
  'cargo', 'freight', 'fedex', 'ups', 'dhl', 'atlas', 'kalitta',
  'abx', 'air transport', 'polar air',
];

const CARGO_TYPE_CODES = [
  'B763', 'B762', 'B752', 'MD11', 'B744', 'A30B', 'DC8', 'DC10',
];

const PRIVATE_PATTERNS = [/\bllc\b/i, /\binc\b/i, /\btrust\b/i, /\bcorp\b/i];

export function classify(params: {
  callsign: string | null;
  operator: string | null;
  owner: string | null;
  typeCode: string | null;
}): Classification {
  const { callsign, operator, owner, typeCode } = params;
  const cs = (callsign ?? '').toUpperCase();
  const op = (operator ?? '').toLowerCase();
  const ow = (owner ?? '').toLowerCase();
  const tc = (typeCode ?? '').toUpperCase();

  // 1. Government / Military
  if (MILITARY_CALLSIGN_PREFIXES.some((p) => cs.startsWith(p))) return 'military';
  if (GOVERNMENT_KEYWORDS.some((k) => op.includes(k) || ow.includes(k))) return 'government';

  // 2. Cargo
  if (CARGO_KEYWORDS.some((k) => op.includes(k) || ow.includes(k))) return 'cargo';
  if (CARGO_TYPE_CODES.includes(tc)) return 'cargo';

  // 3. Commercial (has a named airline operator)
  if (operator && operator.length > 0) return 'commercial';

  // 4. Private (owner patterns suggest a holding entity)
  if (PRIVATE_PATTERNS.some((re) => re.test(ow))) return 'private';

  return 'unknown';
}
