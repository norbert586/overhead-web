const CLASSIFICATIONS = [
  { key: 'commercial', label: 'Commercial' },
  { key: 'private',    label: 'Private' },
  { key: 'cargo',      label: 'Cargo' },
  { key: 'government', label: 'Gov / Mil' },
  { key: 'unknown',    label: 'Unknown' },
] as const;

export default function ClassificationLegend() {
  return (
    <div className="stat-card">
      <div className="stat-card-header">Classification</div>
      {CLASSIFICATIONS.map(({ key, label }) => (
        <div className="stat-row" key={key}>
          <span className="s-label">
            <span className={`class-dot ${key}`} />
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
