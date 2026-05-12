// Solar position math — dep-free, accurate to ~0.5° which is plenty for
// civil-twilight bucketing. Based on the simplified NOAA / Schlyter
// formulas; we only need *altitude* (no azimuth) and whether the sun is
// effectively below the horizon for the observer.
//
// Reference: https://gml.noaa.gov/grad/solcalc/solareqns.PDF

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * Solar altitude angle in degrees at (lat, lon) for the given Date.
 * Negative values mean the sun is below the horizon.
 *
 *   alt >  0°    → daytime
 *   alt <  0°    → night (geometric)
 *   alt < -6°    → past civil twilight (dark sky)
 */
export function solarAltitudeDeg(when: Date, lat: number, lon: number): number {
  // Julian date
  const J = when.getTime() / 86_400_000 + 2440587.5;
  // Number of days since J2000.0
  const n = J - 2451545.0;

  // Mean ecliptic longitude of the Sun (deg)
  const L = (280.460 + 0.9856474 * n) % 360;
  // Mean anomaly (deg)
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  // Ecliptic longitude (deg)
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  // Obliquity of the ecliptic (deg)
  const eps = (23.439 - 0.0000004 * n) * RAD;

  // Right ascension (rad) and declination (rad)
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  const ra = Math.atan2(Math.cos(eps) * sinLambda, cosLambda);
  const dec = Math.asin(Math.sin(eps) * sinLambda);

  // Greenwich mean sidereal time (hours), reduced to local sidereal time
  // and converted to hour angle for the observer's longitude.
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst  = (gmst * 15 + lon) * RAD;   // local sidereal time in radians
  const H    = lst - ra;                   // hour angle

  const latRad = lat * RAD;
  const sinAlt =
      Math.sin(latRad) * Math.sin(dec)
    + Math.cos(latRad) * Math.cos(dec) * Math.cos(H);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;
}

/**
 * Convenience: is the sun below the civil-twilight horizon (-6°)? That's
 * the threshold most people would call "actually dark", which is what we
 * want for night-flight scoring.
 */
export function isNightAt(when: Date, lat: number, lon: number): boolean {
  return solarAltitudeDeg(when, lat, lon) < -6;
}
