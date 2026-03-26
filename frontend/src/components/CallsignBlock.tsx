import ClassificationBadge from './ClassificationBadge';
import OperatorRow from './OperatorRow';
import type { Classification } from '../types/flight';

interface CallsignBlockProps {
  callsign: string | null;
  aircraftType: string | null;
  manufacturer: string | null;
  operator: string | null;
  operatorLogoUrl?: string | null;
  classification: Classification;
}

export default function CallsignBlock({
  callsign,
  aircraftType,
  manufacturer,
  operator,
  operatorLogoUrl,
  classification,
}: CallsignBlockProps) {
  const typeLabel = [manufacturer, aircraftType].filter(Boolean).join(' ') || '—';

  return (
    <div className="callsign-block">
      <div className="callsign">{callsign ?? '——'}</div>
      <div className="aircraft-type">{typeLabel}</div>
      <OperatorRow operator={operator} logoUrl={operatorLogoUrl} />
      <ClassificationBadge classification={classification} />
    </div>
  );
}
