import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import './App.css';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import EmptyState from './components/EmptyState';
import OverheadFlightScreen from './screens/OverheadFlightScreen';
import { useGeolocation } from './hooks/useGeolocation';
import { usePageVisibility } from './hooks/usePageVisibility';
import SettingsScreen from './screens/SettingsScreen';

// Secondary screens are split out of the main bundle — the catch screen (the
// thing you open outside, on cell data) shouldn't pay for Recharts.
const LogScreen     = lazy(() => import('./screens/LogScreen'));
const StatsScreen   = lazy(() => import('./screens/StatsScreen'));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen'));
const AdminScreen   = lazy(() => import('./screens/AdminScreen'));
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import EmailVerificationBanner from './components/EmailVerificationBanner';
import { useSettings } from './hooks/useSettings';
import { useFlightData } from './hooks/useFlightData';
import { useAuth } from './hooks/useAuth';
import { fetchProfile, updateProfile } from './services/api';

export type View = 'flight' | 'log' | 'stats' | 'settings' | 'profile' | 'admin';
// 'guest' is the default for unauthenticated visitors — they see a live
// overhead view without needing to register. The other values are the
// existing auth flows, reached from the guest top bar.
type AuthView = 'guest' | 'login' | 'register' | 'forgot';

// Tokens are passed via root-relative query params so we don't depend on
// nginx having an SPA fallback for arbitrary paths.
function readUrlToken(param: string): string | null {
  const value = new URLSearchParams(window.location.search).get(param);
  return value && value.length > 0 ? value : null;
}

// Fixed poll cadence for the catch feed. Not user-configurable — the server
// enforces its own write-frequency floor regardless.
const CATCH_POLL_SEC = 10;

function App() {
  const { user, isAuthenticated, login, logout, refreshUser } = useAuth();
  // Snapshot URL params once on mount so React Strict Mode's double-effect
  // doesn't try to redeem the same token twice.
  const [resetToken,  setResetToken ] = useState<string | null>(() => readUrlToken('reset_token'));
  const [verifyToken, setVerifyToken] = useState<string | null>(() => readUrlToken('verify_token'));
  const [authView, setAuthView] = useState<AuthView>('guest');
  const [view, setView] = useState<View>('flight');
  const { settings, saveSettings, syncFromServer, hasSettings } = useSettings();
  const profileFetched = useRef(false);

  // On every authentication event, load the user's settings from the server.
  // Strategy:
  //   1. Server has location  → use server (canonical across devices)
  //   2. Server has no location but localStorage does → push local to server
  // A fallback location is optional under the catch model (live GPS is the
  // primary catch point), so new users are never forced to Settings.
  useEffect(() => {
    if (!isAuthenticated) {
      profileFetched.current = false;
      return;
    }
    if (profileFetched.current) return;
    profileFetched.current = true;

    fetchProfile()
      .then((profile) => {
        refreshUser({ isAdmin: profile.isAdmin, emailVerified: profile.emailVerified });
        const serverHasLocation = profile.latitude !== null && profile.longitude !== null;

        if (serverHasLocation) {
          syncFromServer({
            latitude: profile.latitude,
            longitude: profile.longitude,
            radiusNm: profile.radiusNm,
          });
        } else if (settings.latitude !== null && settings.longitude !== null) {
          // Migration path: they had localStorage data before server persistence existed
          updateProfile({
            latitude: settings.latitude,
            longitude: settings.longitude,
            radiusNm: settings.radiusNm,
          }).catch(() => {});
        }
      })
      .catch(() => {
        // Network failure — localStorage settings remain in effect
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Wrapped save: writes to localStorage + pushes to server.
  // After a first-time fallback-location setup, navigates back to catching.
  async function handleSaveSettings(s: typeof settings) {
    const isFirstSetup = !hasSettings && s.latitude !== null && s.longitude !== null;
    saveSettings(s);
    updateProfile(s).catch(() => {});
    if (isFirstSetup) {
      setTimeout(() => setView('flight'), 1200);
    }
  }

  // ── The catch feed ─────────────────────────────────────────────────────────
  // Live device location is the catch point. If GPS is unavailable (denied,
  // unsupported, errored) we fall back to the saved home location. Catching
  // runs anywhere in the app — checking your log or stats still counts as
  // being here — but only while the page is actually visible: leave the page
  // and you stop catching.
  const pageVisible = usePageVisibility();
  const geo = useGeolocation({ enabled: isAuthenticated });

  const geoUnavailable =
    geo.status === 'denied' || geo.status === 'unsupported' || geo.status === 'error';
  const hasFallback = settings.latitude !== null && settings.longitude !== null;
  const usingFallback = geoUnavailable && hasFallback;

  const catchLat = usingFallback ? settings.latitude : geo.latitude;
  const catchLon = usingFallback ? settings.longitude : geo.longitude;

  const { data, lastPollTime } = useFlightData({
    latitude:        catchLat,
    longitude:       catchLon,
    radiusNm:        settings.radiusNm,
    pollIntervalSec: CATCH_POLL_SEC,
    enabled:         isAuthenticated && pageVisible && catchLat !== null && catchLon !== null,
  });

  // Session catch tally — distinct aircraft recorded since this page load.
  // Recorded flights come back with timesSeen >= 1; display-only contacts
  // (expanded radius) come back with timesSeen 0 and don't count.
  const sessionHexes = useRef(new Map<string, boolean>()); // hex → was new to the log
  const [sessionCaught, setSessionCaught] = useState(0);
  const [sessionNew, setSessionNew] = useState(0);

  // The tally belongs to one account: signing out (or switching users in the
  // same tab) starts a fresh session count.
  const userId = user?.id ?? null;
  useEffect(() => {
    sessionHexes.current = new Map();
    setSessionCaught(0);
    setSessionNew(0);
  }, [userId]);

  useEffect(() => {
    const flights = data?.flights ?? [];
    let changed = false;
    for (const f of flights) {
      if (f.timesSeen >= 1 && !sessionHexes.current.has(f.hex)) {
        sessionHexes.current.set(f.hex, f.timesSeen === 1);
        changed = true;
      }
    }
    if (changed) {
      const entries = [...sessionHexes.current.values()];
      setSessionCaught(entries.length);
      setSessionNew(entries.filter(Boolean).length);
    }
  }, [data]);

  // Email-verification link — works whether or not the user is logged in.
  // After they hit Continue we clear the token and fall through to normal
  // auth/app rendering below.
  if (verifyToken) {
    return (
      <VerifyEmailScreen
        token={verifyToken}
        onContinue={() => {
          if (isAuthenticated) refreshUser({ emailVerified: true });
          setVerifyToken(null);
        }}
      />
    );
  }

  if (!isAuthenticated) {
    if (resetToken) {
      return (
        <ResetPasswordScreen
          token={resetToken}
          onLogin={(t, u) => {
            setResetToken(null);
            login(t, u);
          }}
          onBackToLogin={() => {
            setResetToken(null);
            window.history.replaceState({}, '', window.location.pathname);
            setAuthView('login');
          }}
        />
      );
    }
    if (authView === 'register') {
      return (
        <RegisterScreen
          onLogin={login}
          onShowLogin={() => setAuthView('login')}
          onBackToGuest={() => setAuthView('guest')}
        />
      );
    }
    if (authView === 'forgot') {
      return (
        <ForgotPasswordScreen
          onBackToLogin={() => setAuthView('login')}
        />
      );
    }
    if (authView === 'login') {
      return (
        <LoginScreen
          onLogin={login}
          onShowRegister={() => setAuthView('register')}
          onShowForgotPassword={() => setAuthView('forgot')}
          onBackToGuest={() => setAuthView('guest')}
        />
      );
    }
    return (
      <GuestShell
        onShowLogin={() => setAuthView('login')}
        onShowRegister={() => setAuthView('register')}
      />
    );
  }

  function renderMain() {
    if (view === 'settings') {
      return (
        <SettingsScreen
          settings={settings}
          onSave={handleSaveSettings}
          isFirstSetup={!hasSettings}
        />
      );
    }

    if (view === 'log') {
      return <LogScreen />;
    }

    if (view === 'stats') {
      return <StatsScreen />;
    }

    if (view === 'profile') {
      return <ProfileScreen userEmail={user?.email} />;
    }

    if (view === 'admin') {
      if (!user?.isAdmin) {
        return <EmptyState variant="no-aircraft" />;
      }
      return <AdminScreen />;
    }

    // Catch view — the main screen. Live aircraft with recording.
    const flights = data?.flights ?? [];

    // Whenever we have any flight data, show it — even if a refetch is in
    // flight or geolocation briefly flickered back to 'loading'. Empty
    // states should only appear when we genuinely have nothing to show.
    if (flights.length > 0) {
      return (
        <OverheadFlightScreen
          flights={flights}
          matchedRadiusNm={data?.matchedRadiusNm}
          recording
          sessionCaught={sessionCaught}
          sessionNew={sessionNew}
          usingFallback={usingFallback}
        />
      );
    }

    // GPS unavailable and no saved fallback — nothing to catch from.
    if (geoUnavailable && !hasFallback) {
      return (
        <EmptyState
          variant="geo-denied"
          onRetry={geo.retry}
          onOpenSettings={() => setView('settings')}
        />
      );
    }
    if (!usingFallback && (geo.status === 'idle' || geo.status === 'loading')) {
      return <EmptyState variant="geo-loading" />;
    }
    return <EmptyState variant="no-aircraft-overhead" />;
  }

  // Verification banner shows when we have a confirmed answer from the
  // profile endpoint (emailVerified === false). While the field is undefined
  // — pre-fetch, or for legacy login responses — we suppress the banner to
  // avoid flashing it on every load.
  const showVerifyBanner = isAuthenticated && user?.emailVerified === false && !!user?.email;

  return (
    <div className="app-shell">
      <TopBar
        view={view}
        setView={setView}
        radiusNm={settings.radiusNm}
        listening={isAuthenticated && pageVisible && catchLat !== null}
        latitude={catchLat}
        longitude={catchLon}
        userEmail={user?.email}
        isAdmin={user?.isAdmin ?? false}
        onLogout={logout}
      />
      {showVerifyBanner && <EmailVerificationBanner email={user!.email} />}
      <main className="app-main">
        <Suspense fallback={null}>
          {renderMain()}
        </Suspense>
      </main>
      <BottomBar lastPollTime={lastPollTime} />
    </div>
  );
}

// Unauthenticated landing — shows a live overhead view without requiring
// signup. The backend serves /api/flights?record=false for guests; all other
// routes (log, stats, profile) stay locked behind auth.
function GuestShell({
  onShowLogin,
  onShowRegister,
}: {
  onShowLogin: () => void;
  onShowRegister: () => void;
}) {
  const geo = useGeolocation({ enabled: true });
  const guestFlight = useFlightData({
    latitude:        geo.latitude,
    longitude:       geo.longitude,
    radiusNm:        10,
    pollIntervalSec: 12,
    enabled:         geo.status === 'ready',
    record:          false,
  });

  function renderPane() {
    const flights = guestFlight.data?.flights ?? [];
    if (flights.length > 0) {
      return (
        <OverheadFlightScreen
          flights={flights}
          matchedRadiusNm={guestFlight.data?.matchedRadiusNm}
        />
      );
    }
    if (geo.status === 'denied' || geo.status === 'unsupported' || geo.status === 'error') {
      return <EmptyState variant="geo-denied" onRetry={geo.retry} />;
    }
    if (geo.status === 'idle' || geo.status === 'loading') {
      return <EmptyState variant="geo-loading" />;
    }
    return <EmptyState variant="no-aircraft-overhead" />;
  }

  return (
    <div className="app-shell">
      <header className="top-bar guest-top-bar">
        <div className="top-bar-left">
          <div className="app-logo">
            <svg viewBox="0 0 24 24" className="app-logo-icon" aria-hidden="true">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
            <span className="app-name">Overhead</span>
          </div>
          <div className="scan-status">
            <div className="scan-dot" />
            <span className="scan-text">Guest · live view</span>
          </div>
        </div>
        <div className="top-bar-right guest-top-bar-actions">
          <button className="auth-link guest-signin-link" onClick={onShowLogin}>
            Sign in
          </button>
          <button className="auth-btn guest-register-btn" onClick={onShowRegister}>
            Register
          </button>
        </div>
      </header>
      <main className="app-main">
        {renderPane()}
        <p className="guest-upsell">
          Sign up to save your flight history, stats, and achievements.
        </p>
      </main>
      <BottomBar lastPollTime={guestFlight.lastPollTime} />
    </div>
  );
}

export default App;
