// ICAO type-code → silhouette category. Heuristic prefix matching over the
// designators that actually show up in ADS-B data.

export type SilhouetteCategory = 'jet' | 'prop' | 'heli';

const HELI_PREFIXES = ['R22', 'R44', 'R66', 'EC', 'AS3', 'AS5', 'H47', 'H60', 'H64', 'B06', 'B407', 'B412', 'B429', 'S76', 'S92', 'UH1', 'A109', 'A119', 'A139', 'AW', 'MD5', 'MD6'];
const PROP_PREFIXES = ['C1', 'C2', 'C3', 'P28', 'PA', 'SR2', 'DA2', 'DA4', 'BE3', 'BE5', 'BE9', 'BE2', 'M20', 'DV2', 'RV', 'AT7', 'DH8', 'PC12', 'TBM', 'SF5', 'G115', 'DR4'];

export function categorize(type: string | null): SilhouetteCategory {
  if (!type) return 'jet';
  const t = type.toUpperCase();
  if (HELI_PREFIXES.some((p) => t.startsWith(p))) return 'heli';
  if (PROP_PREFIXES.some((p) => t.startsWith(p))) return 'prop';
  return 'jet';
}
