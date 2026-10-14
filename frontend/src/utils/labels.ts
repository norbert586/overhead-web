// Words shown for the server's enums. Sentence case, plain language: these
// used to be lower-case data values uppercased by CSS.
import type { Classification, InterestTier } from '../types/flight';

export const CLASS_LABEL: Record<Classification, string> = {
  commercial: 'Airline',
  private:    'Private',
  cargo:      'Cargo',
  government: 'Government',
  military:   'Military',
  unknown:    'Unknown',
};

export const TIER_LABEL: Record<InterestTier, string> = {
  rare:        'Rare',
  interesting: 'Interesting',
  noteworthy:  'Noteworthy',
  routine:     'Routine',
};

export function classLabel(c: string | null | undefined): string {
  return (c && CLASS_LABEL[c as Classification]) || 'Unknown';
}
