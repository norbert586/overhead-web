import type { Classification } from '../types/flight';

interface ClassificationBadgeProps {
  classification: Classification;
}

export default function ClassificationBadge({ classification }: ClassificationBadgeProps) {
  return (
    <span className={`classification-badge ${classification}`}>
      {classification}
    </span>
  );
}
