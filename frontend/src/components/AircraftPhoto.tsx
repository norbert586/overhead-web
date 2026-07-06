import { useState, useEffect } from 'react';
import { findPhotoDeep, thumbnailFallback, type ResolvedPhoto } from '../utils/photos';
import AircraftSilhouette from './AircraftSilhouette';

interface AircraftPhotoProps {
  photoUrl: string | null;       // Tier 1: adsbdb (from backend)
  callsign: string | null;
  registration: string | null;
  hex?: string | null;           // Enables Planespotters hex lookup
  aircraftType?: string | null;  // Enables similar-airframe fallback
}

interface PhotoState {
  src: string | null;
  /** null while tier 1; otherwise where the fallback photo came from. */
  resolved: ResolvedPhoto | null;
  fbSrc: string | null;
  /** True once every tier has been tried and failed. */
  exhausted: boolean;
}

const EMPTY: PhotoState = { src: null, resolved: null, fbSrc: null, exhausted: false };

function tier1State(url: string): PhotoState {
  const fb = thumbnailFallback(url);
  return { src: url, resolved: null, fbSrc: fb !== url ? fb : null, exhausted: false };
}

function fallbackState(r: ResolvedPhoto): PhotoState {
  const fb = thumbnailFallback(r.url);
  return { src: r.url, resolved: r, fbSrc: fb !== r.url ? fb : null, exhausted: false };
}

export default function AircraftPhoto({ photoUrl, callsign, registration, hex, aircraftType }: AircraftPhotoProps) {
  const [photo, setPhoto] = useState<PhotoState>(EMPTY);

  // Reset when the airframe changes — derived state during render so the old
  // aircraft's photo never flashes on the new one.
  const propKey = `${photoUrl ?? ''}|${registration ?? ''}|${hex ?? ''}|${aircraftType ?? ''}`;
  const [loadedKey, setLoadedKey] = useState(propKey);
  if (loadedKey !== propKey) {
    setLoadedKey(propKey);
    setPhoto(photoUrl ? tier1State(photoUrl) : EMPTY);
  }

  useEffect(() => {
    if (photoUrl) return; // tier 1 already applied synchronously
    let cancelled = false;
    findPhotoDeep(registration ?? null, hex ?? null, aircraftType ?? null).then((r) => {
      if (cancelled) return;
      setPhoto(r ? fallbackState(r) : { ...EMPTY, exhausted: true });
    });
    return () => { cancelled = true; };
  }, [photoUrl, registration, hex, aircraftType]);

  async function handleError(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.target as HTMLImageElement;

    // First: the safe thumbnail fallback (Planespotters full_nosym → thumbnail_large)
    if (photo.fbSrc && img.src !== photo.fbSrc) {
      setPhoto({ ...photo, src: photo.fbSrc, fbSrc: null });
      return;
    }
    // A broken tier-1 URL cascades into the full fallback waterfall
    if (!photo.resolved) {
      const r = await findPhotoDeep(registration ?? null, hex ?? null, aircraftType ?? null);
      if (r) { setPhoto(fallbackState(r)); return; }
    }
    setPhoto({ ...EMPTY, exhausted: true });
  }

  const { src, resolved } = photo;
  const isSimilar = resolved?.source === 'similar';

  const sourceLabel = src
    ? (resolved === null ? 'ADSBDB'
      : resolved.source === 'similar'
        ? `SIMILAR · ${aircraftType ?? '?'}${resolved.surrogateReg ? ` · ${resolved.surrogateReg}` : ''}`
        : 'PLANESPOTTERS')
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
      {isSimilar && (
        <div className="photo-similar-note">
          Photo is of a different {aircraftType ?? 'aircraft'} of the same model
          {resolved?.surrogateReg ? ` (${resolved.surrogateReg})` : ''}, not the actual airframe overhead.
        </div>
      )}
    </div>
  );
}
