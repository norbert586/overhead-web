// Pattern detection over a flight's stored position track.
//
// All algorithms are read-only over a small window of recent positions and
// return a small `TrajectoryAnalysis` object that scoreFlight folds into its
// `trajectory` component. No DB access here — the caller is responsible for
// pulling positions and passing them in.

import { crossTrackNm, haversineNm, lookupAirport } from './referenceData';

export interface TrackPoint {
  ts: string;           // ISO timestamp
  lat: number;
  lon: number;
  altitudeFt: number | null;
  speedKts: number | null;
  bearingDeg: number | null;
}

export interface TrajectoryFlags {
  holding: boolean;
  orbit: boolean;
  courseReversal: boolean;
  greatCircleDeviationNm: number | null;  // null if origin/dest unknown
}

export interface TrajectoryAnalysis {
  flags: TrajectoryFlags;
  reasons: string[];
  score: number;          // 0..1
}

const EMPTY_ANALYSIS: TrajectoryAnalysis = {
  flags: { holding: false, orbit: false, courseReversal: false, greatCircleDeviationNm: null },
  reasons: [],
  score: 0,
};

// Detection windows / thresholds — tuned for 12s scans.
const WINDOW_MS = 6 * 60 * 1000;          // last 6 minutes
const MIN_POSITIONS_HOLDING = 8;          // ~1.5 min worth of samples
const MIN_POSITIONS_ORBIT   = 10;
const REVERSAL_DEG          = 150;
const HOLDING_REVERSAL_MIN  = 3;          // ≥3 reversals → holding
const ORBIT_RADIUS_NM       = 4;          // all positions within this of centroid
const ORBIT_RATIO_MIN       = 2.0;        // total-path / net-displacement
const GC_DEVIATION_NM       = 100;        // > this from filed GC track

/**
 * Run all enabled pattern detectors over a recent slice of the flight's
 * track. Returns an empty (score=0) analysis if there isn't enough data.
 */
export function analyseTrajectory(
  allPositions: TrackPoint[],
  originIata: string | null,
  destIata: string | null,
): TrajectoryAnalysis {
  if (allPositions.length === 0) return EMPTY_ANALYSIS;

  // Slice the window backwards from "now" (= latest position time)
  const newest = new Date(allPositions[allPositions.length - 1].ts).getTime();
  const cutoff = newest - WINDOW_MS;
  const window = allPositions.filter((p) => new Date(p.ts).getTime() >= cutoff);

  // GC deviation is a single-point calc — always compute it if we have any
  // position and the origin/dest are known. The motion-based detectors still
  // need a multi-sample window.
  const latest = allPositions[allPositions.length - 1];
  const gcDeviation = computeGcDeviation(latest, originIata, destIata);

  const flags: TrajectoryFlags = {
    holding:        window.length >= 3 && detectHolding(window),
    orbit:          window.length >= 3 && detectOrbit(window),
    courseReversal: window.length >= 3 && detectCourseReversal(window),
    greatCircleDeviationNm: gcDeviation,
  };

  const reasons: string[] = [];
  let score = 0;

  if (flags.orbit) {
    score = Math.max(score, 0.90);
    reasons.push('Orbiting / loitering');
  }
  if (flags.holding) {
    score = Math.max(score, 0.80);
    reasons.push('Holding pattern detected');
  }
  if (flags.courseReversal) {
    score = Math.max(score, 0.60);
    reasons.push('Course reversal');
  }
  if (flags.greatCircleDeviationNm != null
      && flags.greatCircleDeviationNm > GC_DEVIATION_NM) {
    score = Math.max(score, 0.40);
    reasons.push(`Off-route by ${Math.round(flags.greatCircleDeviationNm)} nm`);
  }

  return { flags, reasons, score };
}

// ── Holding pattern ─────────────────────────────────────────────────────────
// Detect: ≥N reversal events (consecutive bearings differ by >150°). The
// bearing source is `track` from ADS-B, which is already smoothed by the
// receiver. We ignore samples missing a bearing.
function detectHolding(positions: TrackPoint[]): boolean {
  if (positions.length < MIN_POSITIONS_HOLDING) return false;
  let reversals = 0;
  for (let i = 1; i < positions.length; i++) {
    const a = positions[i - 1].bearingDeg;
    const b = positions[i].bearingDeg;
    if (a == null || b == null) continue;
    if (turnAngle(a, b) > REVERSAL_DEG) reversals++;
  }
  return reversals >= HOLDING_REVERSAL_MIN;
}

// ── Orbit / loiter ──────────────────────────────────────────────────────────
// Detect: aircraft confined to a small disk around its centroid for the
// whole window, AND covered more ground than the disk diameter (i.e. it's
// circling, not stationary).
function detectOrbit(positions: TrackPoint[]): boolean {
  if (positions.length < MIN_POSITIONS_ORBIT) return false;

  const cLat = positions.reduce((s, p) => s + p.lat, 0) / positions.length;
  const cLon = positions.reduce((s, p) => s + p.lon, 0) / positions.length;

  let maxR = 0;
  for (const p of positions) {
    const r = haversineNm(cLat, cLon, p.lat, p.lon);
    if (r > maxR) maxR = r;
  }
  if (maxR > ORBIT_RADIUS_NM) return false;

  // Path length vs. net displacement. A straight line ratio ≈ 1; a circle ≈ π.
  let path = 0;
  for (let i = 1; i < positions.length; i++) {
    path += haversineNm(
      positions[i - 1].lat, positions[i - 1].lon,
      positions[i].lat,     positions[i].lon,
    );
  }
  const first = positions[0];
  const last  = positions[positions.length - 1];
  const displacement = Math.max(0.01, haversineNm(first.lat, first.lon, last.lat, last.lon));

  return (path / displacement) >= ORBIT_RATIO_MIN;
}

// ── Course reversal ─────────────────────────────────────────────────────────
// Detect: a single big bearing change between the window's start and end,
// without the aircraft having (effectively) stopped. Distinct from holding,
// which is multiple reversals.
function detectCourseReversal(positions: TrackPoint[]): boolean {
  if (positions.length < 4) return false;
  const start = positions[0].bearingDeg;
  const end   = positions[positions.length - 1].bearingDeg;
  if (start == null || end == null) return false;
  if (turnAngle(start, end) < REVERSAL_DEG) return false;

  // Make sure speeds were reasonable in this window (>= 60 kts on average) —
  // otherwise this is just a parked helicopter.
  const speeds = positions.map((p) => p.speedKts).filter((s): s is number => s != null);
  if (speeds.length === 0) return false;
  const avg = speeds.reduce((s, v) => s + v, 0) / speeds.length;
  return avg >= 60;
}

// ── Great-circle deviation ──────────────────────────────────────────────────
// Cross-track distance from current position to the GC line origin→dest.
// Routine ATC vectoring is < 50 nm; > 100 nm = filed/actual mismatch.
function computeGcDeviation(
  current: TrackPoint,
  originIata: string | null,
  destIata:   string | null,
): number | null {
  const o = lookupAirport(originIata);
  const d = lookupAirport(destIata);
  if (!o || !d) return null;
  return crossTrackNm(current.lat, current.lon, o.lat, o.lon, d.lat, d.lon);
}

// ── Geometry primitive ──────────────────────────────────────────────────────
// Smallest angle between two bearings (degrees), in [0..180].
function turnAngle(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}
