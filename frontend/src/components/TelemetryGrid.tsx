import {
  formatAltitude,
  formatSpeed,
  formatBearing,
  formatDistance,
  bearingToCardinal,
} from '../utils/formatting';
import HeadingArrow from './HeadingArrow';

interface TelemetryGridProps {
  altitudeFt: number | null;
  speedKts: number | null;
  bearingDeg: number | null;
  distanceNm: number | null;
}

interface CellProps {
  label: string;
  value: string;
  unit: string;
  glyph?: React.ReactNode;
}

function Cell({ label, value, unit, glyph }: CellProps) {
  return (
    <div className="t-cell">
      <div className="t-label">{label}</div>
      <div className="t-value">
        {value}
        {glyph}
      </div>
      <div className="t-unit">{unit}</div>
    </div>
  );
}

export default function TelemetryGrid({
  altitudeFt,
  speedKts,
  bearingDeg,
  distanceNm,
}: TelemetryGridProps) {
  return (
    <div className="telemetry-grid">
      <Cell label="Alt"  value={formatAltitude(altitudeFt)} unit="ft" />
      <Cell label="Spd"  value={formatSpeed(speedKts)}      unit="kts" />
      <Cell
        label="Brg"
        value={formatBearing(bearingDeg)}
        unit={bearingDeg !== null ? bearingToCardinal(bearingDeg) : '—'}
        glyph={bearingDeg !== null ? <HeadingArrow deg={bearingDeg} className="t-heading-arrow" /> : undefined}
      />
      <Cell label="Dist" value={formatDistance(distanceNm)} unit="nm" />
    </div>
  );
}
