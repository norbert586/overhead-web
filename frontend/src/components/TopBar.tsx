import { useState, useEffect, useRef } from 'react';
import HamburgerMenu from './HamburgerMenu';
import type { View } from '../App';

interface TopBarProps {
  view: View;
  setView: (view: View) => void;
  radiusNm?: number;
  pollIntervalSec?: number;
  latitude?: number | null;
  longitude?: number | null;
}

export default function TopBar({
  view,
  setView,
  radiusNm = 25,
  pollIntervalSec = 12,
  latitude,
  longitude,
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

  const coordsLabel =
    latitude != null && longitude != null
      ? `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? 'E' : 'W'}`
      : null;

  return (
    <div ref={wrapRef}>
      <header className="top-bar">
        <div className="top-bar-left">
          <div className="app-logo">
            <svg viewBox="0 0 24 24" className="app-logo-icon" aria-hidden="true">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
            <span className="app-name">Overhead</span>
          </div>
          <div className="scan-status">
            <div className="scan-dot" />
            <span className="scan-text">
              Tracking · {radiusNm} nm · {pollIntervalSec}s
            </span>
          </div>
        </div>
        <div className="top-bar-right">
          {coordsLabel && <span className="status-info">{coordsLabel}</span>}
          <button
            className="hamburger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
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
        onSelect={(v) => {
          setView(v);
          setMenuOpen(false);
        }}
      />
    </div>
  );
}
