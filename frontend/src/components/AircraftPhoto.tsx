import { useState, useEffect } from 'react';
import { fetchPhoto, fetchPhotoByType, thumbnailFallback } from '../utils/photos';

interface AircraftPhotoProps {
  photoUrl: string | null;       // Provider 1: adsbdb (from backend)
  callsign: string | null;
  registration: string | null;
  aircraftType?: string | null;  // For similar-planes fallback
}

type Tier = 1 | 2 | 3;  // 1=adsbdb, 2=planespotters/reg, 3=planespotters/type

export default function AircraftPhoto({ photoUrl, callsign, registration, aircraftType }: AircraftPhotoProps) {
  const [src,  setSrc ] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier | null>(null);
  const [fbSrc, setFbSrc] = useState<string | null>(null);

  function applyUrl(url: string, t: Tier) {
    setSrc(url);
    setTier(t);
    const fb = thumbnailFallback(url);
    setFbSrc(fb !== url ? fb : null);
  }

  useEffect(() => {
    setSrc(null);
    setTier(null);
    setFbSrc(null);
    let cancelled = false;

    async function run() {
      // Tier 1: adsbdb photo URL stored by backend
      if (photoUrl) {
        if (!cancelled) applyUrl(photoUrl, 1);
        return;
      }
      // Tier 2: Planespotters by registration
      if (registration) {
        const url = await fetchPhoto(registration);
        if (cancelled) return;
        if (url) { applyUrl(url, 2); return; }
      }
      // Tier 3: Planespotters by ICAO type (similar planes)
      if (aircraftType) {
        const url = await fetchPhotoByType(aircraftType);
        if (cancelled) return;
        if (url) { applyUrl(url, 3); return; }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [photoUrl, registration, aircraftType]);

  async function handleError(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.target as HTMLImageElement;

    // First: try the safe thumbnail fallback (Planespotters full_nosym → thumbnail_large)
    if (fbSrc && img.src !== fbSrc) {
      setSrc(fbSrc);
      setFbSrc(null);
      return;
    }

    // Then cascade to the next tier
    if (tier === 1 && registration) {
      const url = await fetchPhoto(registration);
      if (url) { applyUrl(url, 2); return; }
    }
    if ((tier === 1 || tier === 2) && aircraftType) {
      const url = await fetchPhotoByType(aircraftType);
      if (url) { applyUrl(url, 3); return; }
    }
    setSrc(null);
    setTier(null);
  }

  const sourceLabel =
    tier === 1 ? 'ADSBDB' :
    tier === 2 ? 'PLANESPOTTERS' :
    tier === 3 ? (aircraftType ? `SIMILAR · ${aircraftType}` : 'SIMILAR') :
    null;

  return (
    <div className="aircraft-photo-wrap">
      {src ? (
        <img src={src} alt={callsign ?? 'Aircraft'} onError={handleError} />
      ) : (
        <div className="photo-no-image">No photo available</div>
      )}
      {callsign     && <div className="photo-callsign">{callsign}</div>}
      {registration && <div className="photo-registration">{registration}</div>}
      {sourceLabel  && <div className="photo-source-tag">{sourceLabel}</div>}
    </div>
  );
}
