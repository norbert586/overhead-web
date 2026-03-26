interface TimesSeenCardProps {
  timesSeen: number;
}

export default function TimesSeenCard({ timesSeen }: TimesSeenCardProps) {
  return (
    <div className="times-seen-card">
      <div className="ts-left">
        <span className="ts-label">Times seen</span>
        <span className="ts-sub">This aircraft</span>
      </div>
      <span className="ts-value">{timesSeen}</span>
    </div>
  );
}
