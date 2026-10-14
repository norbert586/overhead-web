interface OperatorRowProps {
  operator: string | null;
  logoUrl?: string | null;
}

export default function OperatorRow({ operator, logoUrl }: OperatorRowProps) {
  if (!operator && !logoUrl) return null;
  return (
    <div className="operator-row">
      {logoUrl && (
        <div className="operator-logo">
          <img src={logoUrl} alt="" width={16} height={16} style={{ objectFit: 'contain' }} />
        </div>
      )}
      <span className="operator-name">{operator ?? 'Unknown operator'}</span>
    </div>
  );
}
