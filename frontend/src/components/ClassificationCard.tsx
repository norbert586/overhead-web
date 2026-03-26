interface ClassificationCounts {
  commercial: number;
  private: number;
  cargo: number;
  government: number;
}

interface ClassificationCardProps {
  counts: ClassificationCounts;
}

const ROWS: { key: keyof ClassificationCounts; label: string }[] = [
  { key: 'commercial', label: 'Commercial' },
  { key: 'private',    label: 'Private' },
  { key: 'cargo',      label: 'Cargo' },
  { key: 'government', label: 'Government' },
];

export default function ClassificationCard({ counts }: ClassificationCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">Classification</div>
      {ROWS.map(({ key, label }) => (
        <div key={key} className="stat-row">
          <span className="s-label">
            <span className={`class-dot ${key}`} />
            {label}
          </span>
          <span className="s-value">{counts[key].toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
