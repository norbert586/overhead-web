interface SessionCardProps {
  totalDetected: number;
  uniqueAircraft: number;
  activeCount: number;
}

export default function SessionCard({
  totalDetected,
  uniqueAircraft,
  activeCount,
}: SessionCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">Session</div>
      <div className="stat-row">
        <span className="s-label">Total detected</span>
        <span className="s-value">{totalDetected.toLocaleString()}</span>
      </div>
      <div className="stat-row">
        <span className="s-label">Unique aircraft</span>
        <span className="s-value">{uniqueAircraft.toLocaleString()}</span>
      </div>
      <div className="stat-row">
        <span className="s-label">Active in range</span>
        <span className="s-value">{activeCount}</span>
      </div>
    </div>
  );
}
