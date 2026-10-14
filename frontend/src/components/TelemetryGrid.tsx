import { bearingToCardinal } from '../utils/formatting';
import { useTween } from '../hooks/useTween';
import HeadingArrow from './HeadingArrow';

interface TelemetryGridProps {
  /** Identifies the aircraft: values snap on a new one and glide on the same one. */
  subject: string;
  altitudeFt: number | null;
  speedKts: number | null;
  bearingDeg: number | null;
  distanceNm: number | null;
  baroRateFpm?: number | null;
}

interface CellProps {
  label: string;
  value: string;
  unit: string;
  glyph?: React.ReactNode;
  note?: string | null;
}

function Cell({ label, value, unit, glyph, note }: CellProps) {
  return (
    <div className="t-cell">
      <div className="t-label">{label}</div>
      <div className="t-value">
        {value}
        <span className="t-unit">{unit}</span>
        {glyph}
      </div>
      {note && <div className="t-note">{note}</div>}
    </div>
  );
}

const thousands = (n: number) => Math.round(n).toLocaleString('en-US');

function verticalNote(fpm: number | null | undefined): string | null {
  if (fpm == null || Math.abs(fpm) < 300) return fpm == null ? null : 'Level';
  return fpm > 0 ? `Climbing ${thousands(Math.abs(fpm))} ft/min` : `Descending ${thousands(Math.abs(fpm))} ft/min`;
}

export default function TelemetryGrid({
  subject,
  altitudeFt,
  speedKts,
  bearingDeg,
  distanceNm,
  baroRateFpm,
}: TelemetryGridProps) {
  const alt = useTween(altitudeFt, subject);
  const spd = useTween(speedKts, subject);
  const dist = useTween(distanceNm, subject);
  return (
    <div className="telemetry-grid">
      <Cell label="Altitude" value={alt === null ? '—' : thousands(alt)} unit="ft" note={verticalNote(baroRateFpm)} />
      <Cell label="Speed" value={spd === null ? '—' : thousands(spd)} unit="kt" note={speedKts !== null ? `${thousands(speedKts * 1.15078)} mph` : null} />
      <Cell
        label="Heading"
        value={bearingDeg === null ? '—' : `${Math.round(bearingDeg)}°`}
        unit={bearingDeg !== null ? bearingToCardinal(bearingDeg) : ''}
        glyph={bearingDeg !== null ? <HeadingArrow deg={bearingDeg} className="t-heading-arrow" /> : undefined}
      />
      <Cell label="Distance" value={dist === null ? '—' : dist.toFixed(1)} unit="nm" note={distanceNm !== null ? `${(distanceNm * 1.15078).toFixed(1)} mi` : null} />
    </div>
  );
}
