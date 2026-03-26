// Overhead — Formatting Utilities

/** Format altitude in feet to display string e.g. "32.4k" */
export function formatAltitude(ft: number | null): string {
  if (ft === null) return '—';
  if (ft >= 1000) return `${(ft / 1000).toFixed(1)}k`;
  return `${ft}`;
}

/** Format speed in knots */
export function formatSpeed(kts: number | null): string {
  if (kts === null) return '—';
  return `${Math.round(kts)}`;
}

/** Format bearing in degrees to compass direction + degrees */
export function formatBearing(deg: number | null): string {
  if (deg === null) return '—';
  return `${Math.round(deg)}°`;
}

/** Format bearing degrees to cardinal direction */
export function bearingToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/** Format distance in nautical miles */
export function formatDistance(nm: number | null): string {
  if (nm === null) return '—';
  return `${nm.toFixed(1)}`;
}

/** Convert a 2-letter ISO country code to a flag emoji */
export function countryToFlag(isoCode: string | null): string {
  if (!isoCode || isoCode.length !== 2) return '';
  return Array.from(isoCode.toUpperCase())
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

/** Format a timestamp to a relative "Xs ago" string */
export function formatRelativeTime(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
