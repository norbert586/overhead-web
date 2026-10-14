import ClassificationBadge from './ClassificationBadge';
import OperatorRow from './OperatorRow';
import type { Classification, InterestTier } from '../types/flight';
import { TIER_LABEL } from '../utils/labels';

interface CallsignBlockProps {
  callsign: string | null;
  registration?: string | null;
  aircraftType: string | null;
  manufacturer: string | null;
  operator: string | null;
  operatorLogoUrl?: string | null;
  classification: Classification;
  interestTier?: InterestTier;
  /** 1 = first time this airframe was caught; >1 = repeat catches; 0 = not recorded. */
  timesSeen?: number;
  /** Rendered beside the callsign (the share button). */
  action?: React.ReactNode;
}

export default function CallsignBlock({
  callsign,
  registration,
  aircraftType,
  manufacturer,
  operator,
  operatorLogoUrl,
  classification,
  interestTier,
  timesSeen = 0,
  action,
}: CallsignBlockProps) {
  const typeLabel = [manufacturer, aircraftType].filter(Boolean).join(' ') || 'Unknown type';
  const notable = interestTier === 'rare' || interestTier === 'interesting';

  return (
    <div className="callsign-block">
      <div className="callsign-row">
        {/* Keyed so a new aircraft's callsign settles in rather than swapping. */}
        <h1 className="callsign" key={callsign ?? registration ?? ''}>
          {callsign ?? registration ?? 'No callsign'}
        </h1>
        {timesSeen === 1 && <span className="overhead-new-badge" title="First time you've caught this aircraft">New</span>}
        {action && <div className="callsign-action">{action}</div>}
      </div>
      <div className="aircraft-type">{typeLabel}</div>
      <OperatorRow operator={operator} logoUrl={operatorLogoUrl} />
      <div className="callsign-chips">
        <ClassificationBadge classification={classification} />
        {notable && interestTier && (
          <span className={`overhead-tier-chip tier--${interestTier}`}>{TIER_LABEL[interestTier]}</span>
        )}
        {timesSeen > 1 && <span className="callsign-seen">Caught {timesSeen} times</span>}
      </div>
    </div>
  );
}
