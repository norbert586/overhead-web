// The sky above the catch point: where the sun is, what colour that makes
// the sky, and where an aircraft sits in it. Drives the sky dome on the
// catch screen and the "follow the sun" theme. Dep-free, the same simplified
// NOAA formulas as backend/src/services/solar.ts (good to ~0.5°), plus
// azimuth, which the server doesn't need.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SunPosition {
  /** Degrees above the horizon; negative once the sun has set. */
  altitude: number;
  /** Compass degrees, 0 = north, clockwise. */
  azimuth: number;
}

export function sunPosition(when: Date, lat: number, lon: number): SunPosition {
  const n = when.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const H = (gmst * 15 + lon) * RAD - ra;
  const phi = lat * RAD;

  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
  // Measured from south, westward; +180 turns it into a compass bearing.
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) * DEG + 180;
  return { altitude, azimuth: ((az % 360) + 360) % 360 };
}

/** Night for the "follow the sun" theme: a few minutes after sunset, when screens start to glare. */
export function isDarkOutside(when: Date, lat: number, lon: number): boolean {
  return sunPosition(when, lat, lon).altitude < -2;
}

// ── Sky colour ─────────────────────────────────────────────────────────────
// Keyed on sun altitude: zenith (straight up, the dome's centre) and horizon
// (its rim). Between keys the colours blend, so dusk drifts rather than steps.

type RGB = [number, number, number];
interface SkyKey { alt: number; zenith: RGB; horizon: RGB; stars: number }

const KEYS: SkyKey[] = [
  { alt: -18, zenith: [9, 15, 32],    horizon: [22, 34, 62],    stars: 1 },
  { alt: -10, zenith: [14, 24, 54],   horizon: [52, 54, 100],   stars: 0.8 },
  { alt: -4,  zenith: [36, 52, 104],  horizon: [128, 104, 150], stars: 0.25 },
  { alt: 0,   zenith: [62, 98, 160],  horizon: [196, 160, 160], stars: 0 },
  { alt: 8,   zenith: [70, 128, 196], horizon: [226, 212, 190], stars: 0 },
  { alt: 25,  zenith: [52, 122, 204], horizon: [200, 222, 240], stars: 0 },
  { alt: 90,  zenith: [40, 110, 200], horizon: [190, 216, 238], stars: 0 },
];

export interface SkyColors {
  zenith: string;
  horizon: string;
  /** 0–1: how visible stars are. */
  stars: number;
  /** 0–1: the warm glow on the sun's side of the horizon around sunrise and sunset. */
  glow: number;
  /** True when ink drawn on the sky should be light. */
  dark: boolean;
}

const mix = (a: RGB, b: RGB, t: number): RGB =>
  [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
const css = ([r, g, b]: RGB) => `rgb(${r} ${g} ${b})`;

export function skyColors(sunAltitude: number): SkyColors {
  const alt = Math.max(-18, Math.min(90, sunAltitude));
  let i = 0;
  while (i < KEYS.length - 2 && alt > KEYS[i + 1].alt) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (alt - a.alt) / (b.alt - a.alt);
  return {
    zenith: css(mix(a.zenith, b.zenith, t)),
    horizon: css(mix(a.horizon, b.horizon, t)),
    stars: a.stars + (b.stars - a.stars) * t,
    // Strongest with the sun just below the horizon, gone by -12° and +12°.
    glow: Math.max(0, 1 - Math.abs(alt + 2) / 10),
    dark: alt < -1,
  };
}

// ── Aircraft in the sky ────────────────────────────────────────────────────

/**
 * Degrees above the horizon an aircraft appears from the ground. Treats the
 * observer as at sea level and the earth as flat over a hearing radius —
 * fine for "where do I look", off by a few degrees at the edge.
 */
export function elevationDeg(altitudeFt: number | null, distanceNm: number | null): number | null {
  if (altitudeFt === null || distanceNm === null) return null;
  if (distanceNm < 0.05) return 90;
  return Math.atan2(Math.max(0, altitudeFt), distanceNm * 6076.12) * DEG;
}

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const COMPASS_SHORT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function compassWord(deg: number, short = false): string {
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return (short ? COMPASS_SHORT : COMPASS)[i];
}

/** "Look northeast, about 30° up" — or "Straight overhead". */
export function lookPhrase(azimuthDeg: number | null, elevation: number | null): string | null {
  if (elevation === null) return null;
  if (elevation >= 75) return 'Straight overhead';
  const up = elevation < 8 ? 'low on the horizon' : `about ${Math.round(elevation / 5) * 5}° up`;
  if (azimuthDeg === null) return `Look ${up}`;
  return `Look ${compassWord(azimuthDeg)}, ${up}`;
}
