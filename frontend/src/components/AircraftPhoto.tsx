import { useEffect, useState } from 'react';
import type { PhotoResult } from '../types/photo';
import { resolvePhotos, photoCredit, photoMatchLabel, photoSearchUrl } from '../utils/photos';
import type { Insets } from '../utils/photoLayout';
import AircraftSilhouette from './AircraftSilhouette';
import SmartPhoto from './SmartPhoto';

interface AircraftPhotoProps {
  callsign: string | null;
  registration: string | null;
  hex?: string | null;
  aircraftType?: string | null;
}

// Keep the aircraft clear of the callsign (top) and the registration and
// photo credit (bottom) drawn over the photo, and of the fades behind them.
const heroInsets = (_w: number, h: number): Insets => ({
  top: Math.min(h * 0.15, 40),
  bottom: Math.min(h * 0.2, 48),
  left: 0,
  right: 0,
});

export default function AircraftPhoto({ callsign, registration, hex, aircraftType }: AircraftPhotoProps) {
  const subjectKey = `${hex ?? ''}|${registration ?? ''}|${aircraftType ?? ''}|${callsign ?? ''}`;
  const [loaded, setLoaded] = useState<{ key: string; result: PhotoResult } | null>(null);
  const result = loaded?.key === subjectKey ? loaded.result : null;

  useEffect(() => {
    let cancelled = false;
    resolvePhotos({ hex: hex ?? null, registration, aircraftType: aircraftType ?? null, callsign })
      .then((r) => { if (!cancelled) setLoaded({ key: subjectKey, result: r }); })
      .catch(() => { if (!cancelled) setLoaded({ key: subjectKey, result: { candidates: [], complete: false } }); });
    return () => { cancelled = true; };
  }, [subjectKey, hex, registration, aircraftType, callsign]);

  const notFound = (
    <AircraftSilhouette aircraftType={aircraftType ?? null} searching={false} searchUrl={photoSearchUrl(registration)} />
  );

  return (
    <div className="aircraft-photo-wrap">
      {!result ? (
        <AircraftSilhouette aircraftType={aircraftType ?? null} searching />
      ) : !result.candidates.length ? notFound : (
        <SmartPhoto candidates={result.candidates} alt={callsign ?? registration ?? 'Aircraft'} insets={heroInsets}>
          {({ active, loaded: shown, exhausted }) => {
            if (exhausted) return notFound;
            if (!active || !shown) return <AircraftSilhouette aircraftType={aircraftType ?? null} searching />;
            const label = photoMatchLabel(active, aircraftType ?? null);
            return (
              <>
                {label && <div className="photo-match-label">{label}</div>}
                {active.link
                  ? <a className="photo-credit" href={active.link} target="_blank" rel="noopener">{photoCredit(active)}</a>
                  : <span className="photo-credit">{photoCredit(active)}</span>}
              </>
            );
          }}
        </SmartPhoto>
      )}
      {callsign     && <div className="photo-callsign">{callsign}</div>}
      {registration && <div className="photo-registration">{registration}</div>}
    </div>
  );
}
