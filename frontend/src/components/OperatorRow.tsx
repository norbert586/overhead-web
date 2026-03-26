interface OperatorRowProps {
  operator: string | null;
  logoUrl?: string | null;
}

export default function OperatorRow({ operator, logoUrl }: OperatorRowProps) {
  return (
    <div className="operator-row">
      <div className="operator-logo">
        {logoUrl ? (
          <img src={logoUrl} alt="" width={16} height={16} style={{ objectFit: 'contain' }} />
        ) : (
          '✈'
        )}
      </div>
      <span className="operator-name">{operator ?? 'Unknown Operator'}</span>
    </div>
  );
}
