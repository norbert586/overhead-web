import { useState, useEffect } from 'react';
import { fetchPhotoWaterfall, type PhotoResult } from '../utils/photos';

interface AircraftPhotoProps {
  photoUrl: string | null;
  callsign: string | null;
  registration: string | null;
  aircraftType?: string | null;
}

type ViewState = 'empty' | 'loading' | 'photo' | 'nointel';

export default function AircraftPhoto({ callsign, registration, aircraftType }: AircraftPhotoProps) {
  const [viewState, setViewState] = useState<ViewState>(registration ? 'loading' : 'empty');
  const [result,    setResult   ] = useState<PhotoResult | null>(null);

  useEffect(() => {
    if (!registration) {
      setViewState('empty');
      setResult(null);
      return;
    }
    setViewState('loading');
    let cancelled = false;

    fetchPhotoWaterfall(registration, aircraftType ?? null).then((res) => {
      if (cancelled) return;
      if (res) {
        setResult(res);
        setViewState('photo');
        console.log(`[AircraftPhoto] rendering "${res.tier}" photo for ${registration}`);
      } else {
        setResult(null);
        setViewState('nointel');
        console.log(`[AircraftPhoto] rendering no-intel box for ${registration} (type: ${aircraftType ?? 'unknown'})`);
      }
    });

    return () => { cancelled = true; };
  }, [registration, aircraftType]);

  // ── Empty (no flight selected / EmptyState placeholder) ─────────
  if (viewState === 'empty') {
    return (
      <div className="aircraft-photo-wrap">
        {callsign && <div className="photo-callsign">{callsign}</div>}
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────
  if (viewState === 'loading') {
    return (
      <div className="aircraft-photo-wrap">
        <div className="photo-scanning">scanning</div>
        {callsign     && <div className="photo-callsign">{callsign}</div>}
        {registration && <div className="photo-registration">{registration}</div>}
      </div>
    );
  }

  // ── Photo (specific or comparable) ──────────────────────────────
  if (viewState === 'photo' && result) {
    return (
      <div className="aircraft-photo-wrap">
        <img
          className="photo-backdrop"
          src={result.url}
          aria-hidden="true"
        />
        <img
          className="photo-main"
          src={result.url}
          alt={callsign ?? registration ?? 'Aircraft'}
          onError={() => setViewState('nointel')}
        />
        {result.tier === 'comparable' && (
          <div className="photo-comparable-badge">COMPARABLE AIRCRAFT · NOT ACTUAL</div>
        )}
        {callsign     && <div className="photo-callsign">{callsign}</div>}
        {registration && <div className="photo-registration">{registration}</div>}
      </div>
    );
  }

  // ── No intel ─────────────────────────────────────────────────────
  return (
    <div className="aircraft-photo-wrap photo-nointel-wrap">
      <div className="nointel-content">
        <div className="nointel-header">NO INTEL — CRAFT UNRESOLVED</div>
        <div className="nointel-fields">
          {registration && (
            <div className="nointel-field">
              <span className="nointel-label">REG</span>
              <span className="nointel-value">{registration}</span>
            </div>
          )}
          {aircraftType && (
            <div className="nointel-field">
              <span className="nointel-label">TYPE</span>
              <span className="nointel-value">{aircraftType}</span>
            </div>
          )}
        </div>
      </div>
      {callsign && <div className="photo-callsign">{callsign}</div>}
    </div>
  );
}
