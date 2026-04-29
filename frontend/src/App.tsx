import { useState, useEffect, useRef } from 'react';
import './App.css';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import EmptyState from './components/EmptyState';
import FlightScreen from './screens/FlightScreen';
import LogScreen from './screens/LogScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';
import ProfileScreen from './screens/ProfileScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import { useSettings } from './hooks/useSettings';
import { useFlightData } from './hooks/useFlightData';
import { useAuth } from './hooks/useAuth';
import { fetchProfile, updateProfile } from './services/api';

export type View = 'flight' | 'log' | 'stats' | 'settings' | 'profile';
type AuthView = 'login' | 'register';

function App() {
  const { user, isAuthenticated, login, logout } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [view, setView] = useState<View>('flight');
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

    // Flight view
    if (!hasSettings) {
      return <EmptyState variant="no-settings" onOpenSettings={() => setView('settings')} />;
    }

    if (loading && !data) {
      return <EmptyState variant="no-aircraft" />;
    }

    if (error) {
      return <EmptyState variant="no-aircraft" />;
    }

    const flights = data?.flights ?? [];

    if (flights.length === 0) {
      return <EmptyState variant="no-aircraft" />;
    }

    return <FlightScreen flight={flights[0]} />;
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
