import { useState, useEffect } from 'react';
import { fetchPhoto, thumbnailFallback } from '../utils/photos';

interface AircraftPhotoProps {
  photoUrl: string | null;
  callsign: string | null;
  registration: string | null;
}

export default function AircraftPhoto({ callsign, registration }: AircraftPhotoProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  useEffect(() => {
    if (!registration) { setSrc(null); setFallback(null); return; }
    let cancelled = false;
    fetchPhoto(registration).then((url) => {
      if (!cancelled && url) {
        setSrc(url);
        // Keep thumbnail as fallback in case the upsized URL 404s
        const fb = thumbnailFallback(url);
        if (fb !== url) setFallback(fb);
      } else if (!cancelled) {
        setSrc(null);
      }
    });
    return () => { cancelled = true; };
  }, [registration]);

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
    </div>
  );
}
