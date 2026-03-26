import { useState } from 'react';
import './App.css';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import EmptyState from './components/EmptyState';
import FlightScreen from './screens/FlightScreen';
import LogScreen from './screens/LogScreen';
import StatsScreen from './screens/StatsScreen';
import SettingsScreen from './screens/SettingsScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import { useSettings } from './hooks/useSettings';
import { useFlightData } from './hooks/useFlightData';
import { useAuth } from './hooks/useAuth';

export type View = 'flight' | 'log' | 'stats' | 'settings';
type AuthView = 'login' | 'register';

function App() {
  const { user, isAuthenticated, login, logout } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [view, setView] = useState<View>('flight');
  const { settings, saveSettings, hasSettings } = useSettings();

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
      return <SettingsScreen settings={settings} onSave={saveSettings} />;
    }

    if (view === 'log') {
      return <LogScreen />;
    }

    if (view === 'stats') {
      return <StatsScreen />;
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
