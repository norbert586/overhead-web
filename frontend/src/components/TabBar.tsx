import type { View } from '../App';
import { FlightIcon, LogIcon, HangarIcon, StatsIcon } from './HamburgerMenu';

// Phones only (CSS hides it above 900 px): the four places you go one-handed,
// outside, at the bottom where a thumb reaches. Everything else stays in the
// menu.
const TABS: { view: View; label: string; Icon: () => React.ReactElement }[] = [
  { view: 'flight', label: 'Catch',  Icon: FlightIcon },
  { view: 'log',    label: 'Log',    Icon: LogIcon },
  { view: 'hangar', label: 'Hangar', Icon: HangarIcon },
  { view: 'stats',  label: 'Stats',  Icon: StatsIcon },
];

export default function TabBar({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map(({ view: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          className={`tab-bar-item${view === v ? ' active' : ''}`}
          aria-current={view === v ? 'page' : undefined}
          onClick={() => { if (v !== view) setView(v); window.scrollTo({ top: 0 }); }}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
