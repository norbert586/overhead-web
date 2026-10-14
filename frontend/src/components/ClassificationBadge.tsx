import type { Classification } from '../types/flight';
import { CLASS_LABEL } from '../utils/labels';

interface ClassificationBadgeProps {
  classification: Classification;
}

export default function ClassificationBadge({ classification }: ClassificationBadgeProps) {
  return (
    <span className={`classification-badge ${classification}`}>
      {CLASS_LABEL[classification] ?? 'Unknown'}
    </span>
  );
}
