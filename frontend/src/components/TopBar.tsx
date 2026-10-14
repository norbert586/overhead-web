import { useState, useEffect, useRef } from 'react';
import HamburgerMenu from './HamburgerMenu';
import type { View } from '../App';
import { openDiagnostics } from '../utils/diagnostics';
import Logo from './Logo';

interface TopBarProps {
  view: View;
  setView: (view: View) => void;
  radiusNm?: number;
  /** True while the catch feed is actively polling (page visible, coords available). */
  listening?: boolean;
  /** Health of the catch feed while listening: data is live, delayed (retrying), or down. */
  feedStatus?: 'live' | 'delayed' | 'down';
  latitude?: number | null;
  longitude?: number | null;
  userEmail?: string;
  isAdmin?: boolean;
  onLogout?: () => void;
}

export default function TopBar({
  view,
  setView,
  radiusNm = 5,
  listening = false,
  feedStatus = 'live',
  latitude,
  longitude,
  userEmail,
  isAdmin = false,
  onLogout,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // "Listening" used to stay up even while every poll was failing.
  const dotClass = !listening ? ' scan-dot-paused'
    : feedStatus === 'down' ? ' scan-dot-error'
    : feedStatus === 'delayed' ? ' scan-dot-warn'
    : '';
  const statusLabel = !listening ? 'Paused'
    : feedStatus === 'down' ? 'No feed, retrying'
    : feedStatus === 'delayed' ? 'Reconnecting…'
    : `Listening within ${radiusNm} nm`;

  const coordsLabel =
    latitude != null && longitude != null
      ? `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`
      : null;

  return (
    <div ref={wrapRef} className="top-bar-wrap">
      <header className="top-bar">
        <div className="top-bar-left">
          <button type="button" className="app-logo" onClick={() => setView('flight')} aria-label="Overhead — back to catching">
            <Logo />
            <span className="app-name">Overhead</span>
          </button>
          <div className="scan-status" role="status">
            <div className={`scan-dot${dotClass}`} />
            <span className="scan-text">{statusLabel}</span>
          </div>
        </div>
        <div className="top-bar-right">
          {coordsLabel && <span className="status-info">{coordsLabel}</span>}
          <button
            className={`hamburger${menuOpen ? ' open' : ''}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <HamburgerMenu
        isOpen={menuOpen}
        view={view}
        userEmail={userEmail}
        isAdmin={isAdmin}
        onSelect={(v) => {
          setView(v);
          setMenuOpen(false);
        }}
        onLogout={() => {
          setMenuOpen(false);
          onLogout?.();
        }}
        onDiagnostics={() => {
          setMenuOpen(false);
          openDiagnostics();
        }}
      />
    </div>
  );
}
