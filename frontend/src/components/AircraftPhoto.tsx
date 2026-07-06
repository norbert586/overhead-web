import { useState, useEffect, useCallback } from 'react';
import { fetchPhoto, fetchPhotoByType, thumbnailFallback } from '../utils/photos';
import AircraftSilhouette from './AircraftSilhouette';

interface AircraftPhotoProps {
  photoUrl: string | null;       // Provider 1: adsbdb (from backend)
  callsign: string | null;
  registration: string | null;
  aircraftType?: string | null;  // For similar-planes fallback
}

type Tier = 1 | 2 | 3;  // 1=adsbdb, 2=planespotters/reg, 3=same-model surrogate from our DB

interface PhotoState {
  src: string | null;
  tier: Tier | null;
  fbSrc: string | null;
  /** Tier 3 only: the registration of the *other* airframe we're showing. */
  surrogateReg: string | null;
  /** True once every tier has been tried and failed. */
  exhausted: boolean;
}

const EMPTY: PhotoState = { src: null, tier: null, fbSrc: null, surrogateReg: null, exhausted: false };

function stateFor(url: string, tier: Tier, surrogate: string | null = null): PhotoState {
  const fb = thumbnailFallback(url);
  return { src: url, tier, fbSrc: fb !== url ? fb : null, surrogateReg: surrogate, exhausted: false };
}

export default function AircraftPhoto({ photoUrl, callsign, registration, aircraftType }: AircraftPhotoProps) {
  const [photo, setPhoto] = useState<PhotoState>(EMPTY);

  // Reset when the aircraft changes — done as derived state during render
  // (the supported "adjust state when props change" pattern) so the old
  // airframe's photo never flashes on the new one.
  const propKey = `${photoUrl ?? ''}|${registration ?? ''}|${aircraftType ?? ''}`;
  const [loadedKey, setLoadedKey] = useState(propKey);
  if (loadedKey !== propKey) {
    setLoadedKey(propKey);
    setPhoto(photoUrl ? stateFor(photoUrl, 1) : EMPTY);
  }

  // Tier 3 lookup excludes the airframe we're trying to render so the backend
  // doesn't echo back the (broken) photo we already failed on.
  const tryTier3 = useCallback(async (): Promise<boolean> => {
    if (!aircraftType) return false;
    const match = await fetchPhotoByType(aircraftType, registration ?? null);
    if (!match) return false;
    setPhoto(stateFor(match.url, 3, match.registration));
    return true;
  }, [aircraftType, registration]);

  useEffect(() => {
    // Tier 1 is applied synchronously by the derived-state reset above.
    if (photoUrl) return;
    let cancelled = false;

    async function run() {
      // Tier 2: Planespotters by registration
      if (registration) {
        const url = await fetchPhoto(registration);
        if (cancelled) return;
        if (url) { setPhoto(stateFor(url, 2)); return; }
      }
      // Tier 3: same-model surrogate from our own DB
      if (aircraftType) {
        const match = await fetchPhotoByType(aircraftType, registration ?? null);
        if (cancelled) return;
        if (match) { setPhoto(stateFor(match.url, 3, match.registration)); return; }
      }
      if (!cancelled) setPhoto({ ...EMPTY, exhausted: true });
    }

    run();
    return () => { cancelled = true; };
  }, [photoUrl, registration, aircraftType]);

  async function handleError(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.target as HTMLImageElement;

    // First: try the safe thumbnail fallback (Planespotters full_nosym → thumbnail_large)
    if (photo.fbSrc && img.src !== photo.fbSrc) {
      setPhoto({ ...photo, src: photo.fbSrc, fbSrc: null });
      return;
    }

    // Then cascade to the next tier
    if (photo.tier === 1 && registration) {
      const url = await fetchPhoto(registration);
      if (url) { setPhoto(stateFor(url, 2)); return; }
    }
    if (photo.tier === 1 || photo.tier === 2) {
      if (await tryTier3()) return;
    }
    setPhoto({ ...EMPTY, exhausted: true });
  }

  const { src, tier, surrogateReg } = photo;

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
        <AircraftSilhouette
          aircraftType={aircraftType ?? null}
          searching={!photo.exhausted}
        />
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
