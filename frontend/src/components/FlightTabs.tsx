import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type TabKey = 'home' | 'overhead';

interface FlightTabsProps {
  active: TabKey;
  onChange: (key: TabKey) => void;
  homePane: ReactNode;
  overheadPane: ReactNode;
}

const SWIPE_THRESHOLD_PX = 60;

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="tab-icon" aria-hidden="true">
      <path d="M12 3l9 7h-3v9h-4v-6h-4v6H6v-9H3z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="tab-icon" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="2"  x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="2"  y1="12" x2="5"  y2="12" />
        <line x1="19" y1="12" x2="22" y2="12" />
        <line x1="4.6" y1="4.6" x2="6.7" y2="6.7" />
        <line x1="17.3" y1="17.3" x2="19.4" y2="19.4" />
        <line x1="4.6" y1="19.4" x2="6.7" y2="17.3" />
        <line x1="17.3" y1="6.7" x2="19.4" y2="4.6" />
      </g>
    </svg>
  );
}

export default function FlightTabs({ active, onChange, homePane, overheadPane }: FlightTabsProps) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [dragDx, setDragDx] = useState(0);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setDragDx(0);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current == null || touchStartY.current == null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Only treat as a horizontal swipe if dx dominates dy.
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragDx(dx);
    }
  }

  function handleTouchEnd() {
    const dx = dragDx;
    setDragDx(0);
    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0 && active === 'home')     onChange('overhead');
    if (dx > 0 && active === 'overhead') onChange('home');
  }

  const baseOffset = active === 'home' ? 0 : -100;
  const dragPercent = dragDx === 0 ? 0 : (dragDx / window.innerWidth) * 100;
  const transform = `translateX(calc(${baseOffset}% + ${dragPercent}%))`;

  return (
    <div className="flight-tabs">
      <div className="flight-tabs-strip" role="tablist">
        <button
          role="tab"
          aria-selected={active === 'home'}
          className={`flight-tab ${active === 'home' ? 'active' : ''}`}
          onClick={() => onChange('home')}
        >
          <HomeIcon />
          <span>Home</span>
        </button>
        <button
          role="tab"
          aria-selected={active === 'overhead'}
          className={`flight-tab overhead-tab ${active === 'overhead' ? 'active' : ''}`}
          onClick={() => onChange('overhead')}
        >
          <SunIcon />
          <span>Overhead</span>
        </button>
      </div>

      <div
        className="flight-tabs-viewport"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flight-tabs-track"
          style={{
            transform,
            transition: dragDx === 0 ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
        >
          <div className="flight-tabs-pane">{homePane}</div>
          <div className="flight-tabs-pane" data-theme="overhead">{overheadPane}</div>
        </div>
      </div>
    </div>
  );
}
