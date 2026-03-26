interface TopAircraftCardProps {
  topAircraft: { type: string; count: number }[];
}

export default function TopAircraftCard({ topAircraft }: TopAircraftCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">Top Aircraft Today</div>
      {topAircraft.map(({ type, count }) => (
        <div key={type} className="stat-row">
          <span className="s-label">{type}</span>
          <span className="s-value">{count.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}
