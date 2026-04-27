import { useState, useEffect } from 'react';
import { fetchPhoto, fetchPhotoByType, thumbnailFallback } from '../utils/photos';

interface AircraftPhotoProps {
  photoUrl: string | null;       // Provider 1: adsbdb (from backend)
  callsign: string | null;
  registration: string | null;
  aircraftType?: string | null;  // For similar-planes fallback
}

export default function AircraftPhoto({ photoUrl, callsign, registration, aircraftType }: AircraftPhotoProps) {
  const [src,       setSrc      ] = useState<string | null>(null);
  const [fallback,  setFallback ] = useState<string | null>(null);
  const [isSimilar, setIsSimilar] = useState(false);

  useEffect(() => {
    setSrc(null);
    setFallback(null);
    setIsSimilar(false);
    let cancelled = false;

    function apply(url: string, similar = false) {
      if (cancelled) return;
      setSrc(url);
      setIsSimilar(similar);
      const fb = thumbnailFallback(url);
      if (fb !== url) setFallback(fb);
    }

    async function run() {
      // Provider 1: adsbdb photo URL stored by backend enrichment
      if (photoUrl) { apply(photoUrl); return; }

      // Provider 2: Planespotters by registration
      if (registration) {
        const url = await fetchPhoto(registration);
        if (cancelled) return;
        if (url) { apply(url); return; }
      }

      // Similar planes: Planespotters by ICAO type code
      if (aircraftType) {
        const url = await fetchPhotoByType(aircraftType);
        if (cancelled) return;
        if (url) { apply(url, true); return; }
      }

      // No image — leave src as null
    }

    run();
    return () => { cancelled = true; };
  }, [photoUrl, registration, aircraftType]);

  function handleError(e: React.SyntheticEvent<HTMLImageElement>) {
    if (fallback && (e.target as HTMLImageElement).src !== fallback) {
      setSrc(fallback);
    } else {
      setSrc(null);
    }
  }

  return (
    <div className="aircraft-photo-wrap">
      {src ? (
        <img src={src} alt={callsign ?? 'Aircraft'} onError={handleError} />
      ) : (
        <div className="photo-no-image">No photo available</div>
      )}
      {callsign     && <div className="photo-callsign">{callsign}</div>}
      {registration && <div className="photo-registration">{registration}</div>}
      {isSimilar && src && <div className="photo-similar-badge">Similar aircraft</div>}
    </div>
  );
}
