import { useState, useEffect } from 'react';
import { fetchPhoto, fetchPhotoByType, thumbnailFallback } from '../utils/photos';

interface AircraftPhotoProps {
  photoUrl: string | null;       // Provider 1: adsbdb (from backend)
  callsign: string | null;
  registration: string | null;
  aircraftType?: string | null;  // For similar-planes fallback
}

type Tier = 1 | 2 | 3;  // 1=adsbdb, 2=planespotters/reg, 3=same-model surrogate from our DB

export default function AircraftPhoto({ photoUrl, callsign, registration, aircraftType }: AircraftPhotoProps) {
  const [src,  setSrc ] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier | null>(null);
  const [fbSrc, setFbSrc] = useState<string | null>(null);
  // For Tier 3 (same-model surrogate): the registration of the *other* airframe we're showing.
  const [surrogateReg, setSurrogateReg] = useState<string | null>(null);

  function applyUrl(url: string, t: Tier, surrogate: string | null = null) {
    setSrc(url);
    setTier(t);
    setSurrogateReg(surrogate);
    const fb = thumbnailFallback(url);
    setFbSrc(fb !== url ? fb : null);
  }

  // Tier 3 lookup excludes the airframe we're trying to render so the backend
  // doesn't echo back the (broken) photo we already failed on.
  async function tryTier3(): Promise<boolean> {
    if (!aircraftType) return false;
    const match = await fetchPhotoByType(aircraftType, registration);
    if (!match) return false;
    applyUrl(match.url, 3, match.registration);
    return true;
  }

  useEffect(() => {
    setSrc(null);
    setTier(null);
    setFbSrc(null);
    setSurrogateReg(null);
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
      // Tier 3: same-model surrogate from our own DB
      if (aircraftType) {
        const ok = await tryTier3();
        if (cancelled) return;
        if (ok) return;
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
    if (tier === 1 || tier === 2) {
      if (await tryTier3()) return;
    }
    setSrc(null);
    setTier(null);
    setSurrogateReg(null);
  }

  const sourceLabel =
    tier === 1 ? 'ADSBDB' :
    tier === 2 ? 'PLANESPOTTERS' :
    tier === 3
      ? `SIMILAR · ${aircraftType ?? '?'}${surrogateReg ? ` · ${surrogateReg}` : ''}`
      : null;

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
      {tier === 3 && (
        <div className="photo-similar-note">
          Photo is of a different {aircraftType ?? 'aircraft'} of the same model
          {surrogateReg ? ` (${surrogateReg})` : ''}, not the actual airframe overhead.
        </div>
      )}
    </div>
  );
}
