import { useState, useEffect } from 'react';
import DiagnosticsPanel from './DiagnosticsPanel';
import { APP_VERSION, OPEN_DIAGNOSTICS_EVENT } from '../utils/diagnostics';

interface BottomBarProps {
  lastPollTime: Date | null;
}

function pollLabel(lastPollTime: Date | null): string {
  if (!lastPollTime) return 'No data yet';
  const sec = Math.floor((Date.now() - lastPollTime.getTime()) / 1000);
  return `Last poll: ${sec}s ago`;
}

function wantsDebugOnLoad(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}

export default function BottomBar({ lastPollTime }: BottomBarProps) {
  // The label depends on wall-clock time, so it's computed inside the ticker
  // (and on poll-time changes) rather than during render.
  const [label, setLabel] = useState(() => pollLabel(lastPollTime));
  // Tap the bar (or open with ?debug, or "Details" on an error screen) for
  // the diagnostics panel.
  const [diagOpen, setDiagOpen] = useState(wantsDebugOnLoad);

  useEffect(() => {
    const update = () => setLabel(pollLabel(lastPollTime));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastPollTime]);

  useEffect(() => {
    const open = () => setDiagOpen(true);
    window.addEventListener(OPEN_DIAGNOSTICS_EVENT, open);
    return () => window.removeEventListener(OPEN_DIAGNOSTICS_EVENT, open);
  }, []);

  return (
    <>
      <button
        type="button"
        className="bottom-bar"
        onClick={() => setDiagOpen(true)}
        aria-label="Open diagnostics"
      >
        <span>Overhead v{APP_VERSION}</span>
        <span>{label}</span>
      </button>
      {diagOpen && <DiagnosticsPanel onClose={() => setDiagOpen(false)} />}
    </>
  );
}
