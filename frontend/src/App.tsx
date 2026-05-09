import { useState, useEffect, useRef } from 'react';
import './App.css';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import EmptyState from './components/EmptyState';
import FlightScreen from './screens/FlightScreen';
import OverheadFlightScreen from './screens/OverheadFlightScreen';
import FlightTabs from './components/FlightTabs';
import type { TabKey } from './components/FlightTabs';
import { useGeolocation } from './hooks/useGeolocation';
import LogScreen from './screens/LogScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';
import ProfileScreen from './screens/ProfileScreen';
import AdminScreen from './screens/AdminScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import { useSettings } from './hooks/useSettings';
import { useFlightData } from './hooks/useFlightData';
import { useAuth } from './hooks/useAuth';
import { fetchProfile, updateProfile } from './services/api';

export type View = 'flight' | 'log' | 'stats' | 'settings' | 'profile' | 'admin';
type AuthView = 'login' | 'register';

function App() {
  const { user, isAuthenticated, login, logout, refreshUser } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [view, setView] = useState<View>('flight');
  const [flightTab, setFlightTab] = useState<TabKey>('home');
  const { settings, saveSettings, syncFromServer, hasSettings } = useSettings();
  const profileFetched = useRef(false);

  // On every authentication event, load the user's settings from the server.
  // Strategy:
  //   1. Server has location  → use server (canonical across devices)
  //   2. Server has no location but localStorage does → push local to server
  //   3. Neither has location → send the user to Settings
  useEffect(() => {
    if (!isAuthenticated) {
      profileFetched.current = false;
      return;
    }
    if (profileFetched.current) return;
    profileFetched.current = true;

    fetchProfile()
      .then((profile) => {
        refreshUser({ isAdmin: profile.isAdmin });
        const serverHasLocation = profile.latitude !== null && profile.longitude !== null;

        if (serverHasLocation) {
          syncFromServer({
            latitude: profile.latitude,
            longitude: profile.longitude,
            radiusNm: profile.radiusNm,
            pollIntervalSec: profile.pollIntervalSec,
          });
          // Stay on flight view — they have data
        } else if (settings.latitude !== null && settings.longitude !== null) {
          // Migration path: they had localStorage data before server persistence existed
          const localSettings = {
            latitude: settings.latitude,
            longitude: settings.longitude,
            radiusNm: settings.radiusNm,
            pollIntervalSec: settings.pollIntervalSec,
          };
          updateProfile(localSettings).catch(() => {});
          // Keep existing local state, no view change needed
        } else {
          // Brand new user or no location anywhere — guide them to Settings
          setView('settings');
        }
      })
      .catch(() => {
        // Network failure — fall back to whatever localStorage has
        if (!hasSettings) setView('settings');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Wrapped save: writes to localStorage + pushes to server.
  // After a first-time location setup, navigates to the flight view.
  async function handleSaveSettings(s: typeof settings) {
    const isFirstSetup = !hasSettings && s.latitude !== null && s.longitude !== null;
    saveSettings(s);
    updateProfile(s).catch(() => {});
    if (isFirstSetup) {
      setTimeout(() => setView('flight'), 1200);
    }
  }

  const { data, loading, error, lastPollTime } = useFlightData({
    latitude:        settings.latitude,
    longitude:       settings.longitude,
    radiusNm:        settings.radiusNm,
    pollIntervalSec: settings.pollIntervalSec,
    enabled:         isAuthenticated,
  });

  // Live device location for the Overhead tab. Only requested when the user is
  // authenticated, on the flight view, and actually viewing the Overhead tab —
  // we don't want to ask for location permission until they ask for it.
  const overheadGeoEnabled = isAuthenticated && view === 'flight' && flightTab === 'overhead';
  const overheadGeo = useGeolocation({ enabled: overheadGeoEnabled });

  const overhead = useFlightData({
    latitude:        overheadGeo.latitude,
    longitude:       overheadGeo.longitude,
    radiusNm:        10,
    pollIntervalSec: settings.pollIntervalSec,
    enabled:         overheadGeoEnabled && overheadGeo.status === 'ready',
    record:          false,
  });

  if (!isAuthenticated) {
    if (authView === 'register') {
      return (
        <RegisterScreen
          onLogin={login}
          onShowLogin={() => setAuthView('login')}
        />
      );
    }
    return (
      <LoginScreen
        onLogin={login}
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

    // Flight view
    if (!hasSettings) {
      return <EmptyState variant="no-settings" onOpenSettings={() => setView('settings')} />;
    }

    function renderHomePane() {
      if (loading && !data)            return <EmptyState variant="no-aircraft" />;
      if (error)                       return <EmptyState variant="no-aircraft" />;
      const homeFlights = data?.flights ?? [];
      if (homeFlights.length === 0)    return <EmptyState variant="no-aircraft" />;
      return <FlightScreen flight={homeFlights[0]} />;
    }

    function renderOverheadPane() {
      const overheadFlights = overhead.data?.flights ?? [];

      // Whenever we have any flight data, show it — even if a refetch is in
      // flight or geolocation briefly flickered back to 'loading'. Empty
      // states should only appear when we genuinely have nothing to show.
      if (overheadFlights.length > 0) {
        return <OverheadFlightScreen flights={overheadFlights} />;
      }

      if (overheadGeo.status === 'denied' || overheadGeo.status === 'unsupported') {
        return <EmptyState variant="geo-denied" onRetry={overheadGeo.retry} />;
      }
      if (overheadGeo.status === 'error') {
        return <EmptyState variant="geo-denied" onRetry={overheadGeo.retry} />;
      }
      if (overheadGeo.status === 'idle' || overheadGeo.status === 'loading') {
        return <EmptyState variant="geo-loading" />;
      }
      return <EmptyState variant="no-aircraft-overhead" />;
    }

    return (
      <FlightTabs
        active={flightTab}
        onChange={setFlightTab}
        homePane={renderHomePane()}
        overheadPane={renderOverheadPane()}
      />
    );
  }

  return (
    <div className="app-shell">
      <TopBar
        view={view}
        setView={setView}
        radiusNm={settings.radiusNm}
        pollIntervalSec={settings.pollIntervalSec}
        latitude={settings.latitude}
        longitude={settings.longitude}
        userEmail={user?.email}
        isAdmin={user?.isAdmin ?? false}
        onLogout={logout}
      />
      <main className="app-main">
        {renderMain()}
      </main>
      <BottomBar lastPollTime={lastPollTime} />
    </div>
  );
}

export default App;
