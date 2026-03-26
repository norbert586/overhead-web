import type { View } from '../App';

interface HamburgerMenuProps {
  isOpen: boolean;
  view: View;
  onSelect: (view: View) => void;
}

const FlightIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
  </svg>
);

const LogIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
  </svg>
);

const StatsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 9h2v11H5zm4-4h2v15H9zm4 8h2v7h-2zm4-6h2v13h-2z" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
  </svg>
);

const ITEMS: { view: View; label: string; Icon: () => JSX.Element }[] = [
  { view: 'flight',   label: 'Flight',   Icon: FlightIcon },
  { view: 'log',      label: 'Log',      Icon: LogIcon },
  { view: 'stats',    label: 'Stats',    Icon: StatsIcon },
  { view: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export default function HamburgerMenu({ isOpen, view, onSelect }: HamburgerMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="menu-overlay">
      {ITEMS.map(({ view: v, label, Icon }) => (
        <div
          key={v}
          className={`menu-item${view === v ? ' active' : ''}`}
          onClick={() => onSelect(v)}
        >
          <Icon />
          {label}
        </div>
      ))}
    </div>
  );
}
