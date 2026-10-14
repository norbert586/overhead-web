import { countryToFlag } from '../utils/formatting';

interface IntelCardProps {
  country: string | null;
  countryIso: string | null;
  registration: string | null;
  hex: string;
  typeCode: string | null;
  manufacturer: string | null;
  squawk?: string | null;
}

function IntelRow({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="intel-row">
      <dt className="i-label">{label}</dt>
      <dd className={`i-value${mono ? ' i-value--mono' : ''}`}>{children}</dd>
    </div>
  );
}

/** The airframe's paperwork: who registered it, where, and its transponder codes. */
export default function IntelCard({
  country,
  countryIso,
  registration,
  hex,
  typeCode,
  manufacturer,
  squawk,
}: IntelCardProps) {
  return (
    <section className="intel-card" aria-label="Aircraft details">
      <h2 className="intel-header">Aircraft details</h2>
      <dl>
        <IntelRow label="Registration" mono>{registration ?? '—'}</IntelRow>
        <IntelRow label="Registered in">
          {countryIso && <span className="flag-inline">{countryToFlag(countryIso)}</span>}
          {country ?? '—'}
        </IntelRow>
        <IntelRow label="Manufacturer">{manufacturer ?? '—'}</IntelRow>
        <IntelRow label="Type code" mono>{typeCode ?? '—'}</IntelRow>
        <IntelRow label="Transponder code" mono>{hex.toUpperCase()}</IntelRow>
        {squawk && <IntelRow label="Squawk" mono>{squawk}</IntelRow>}
      </dl>
    </section>
  );
}
