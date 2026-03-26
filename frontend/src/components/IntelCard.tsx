import { countryToFlag } from '../utils/formatting';

interface IntelCardProps {
  country: string | null;
  countryIso: string | null;
  registration: string | null;
  hex: string;
  typeCode: string | null;
  manufacturer: string | null;
}

function IntelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="intel-row">
      <span className="i-label">{label}</span>
      <span className="i-value">{children}</span>
    </div>
  );
}

export default function IntelCard({
  country,
  countryIso,
  registration,
  hex,
  typeCode,
  manufacturer,
}: IntelCardProps) {
  return (
    <div className="intel-card">
      <div className="intel-header">Intel</div>
      <IntelRow label="Country">
        {countryIso && <span className="flag-inline">{countryToFlag(countryIso)}</span>}
        {country ?? '—'}
      </IntelRow>
      <IntelRow label="Reg">{registration ?? '—'}</IntelRow>
      <IntelRow label="Hex">{hex.toUpperCase()}</IntelRow>
      <IntelRow label="Type Code">{typeCode ?? '—'}</IntelRow>
      <IntelRow label="Manufacturer">{manufacturer ?? '—'}</IntelRow>
    </div>
  );
}
