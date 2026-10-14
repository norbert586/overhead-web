import SkyDome from './SkyDome';
import Logo from './Logo';

// Last known position (written by useGeolocation) lets the sign-in sky match
// the real one outside; without it the dome shows a plain day sky.
function lastFix(): { lat: number | null; lon: number | null } {
  try {
    const f = JSON.parse(localStorage.getItem('overhead-web:lastGeoFix') ?? 'null') as { latitude?: number; longitude?: number } | null;
    if (f && typeof f.latitude === 'number' && typeof f.longitude === 'number') return { lat: f.latitude, lon: f.longitude };
  } catch { /* no fix */ }
  return { lat: null, lon: null };
}

/** The frame every sign-in, sign-up and password screen sits in. */
export default function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { lat, lon } = lastFix();
  return (
    <div className="auth-screen">
      <aside className="auth-brand" aria-hidden="true">
        <SkyDome latitude={lat} longitude={lon} listening className="auth-dome" />
        <p className="auth-tagline">Hear a plane? Look up, and know exactly what it is.</p>
      </aside>
      <div className="auth-card">
        <div className="auth-logo">
          <Logo />
          <span className="auth-wordmark">Overhead</span>
        </div>
        <h1 className="auth-title">{title}</h1>
        {children}
      </div>
    </div>
  );
}
