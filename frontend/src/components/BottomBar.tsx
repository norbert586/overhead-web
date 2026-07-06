import { useState, useEffect } from 'react';

interface BottomBarProps {
  lastPollTime: Date | null;
}

function pollLabel(lastPollTime: Date | null): string {
  if (!lastPollTime) return 'No data yet';
  const sec = Math.floor((Date.now() - lastPollTime.getTime()) / 1000);
  return `Last poll: ${sec}s ago`;
}

export default function BottomBar({ lastPollTime }: BottomBarProps) {
  // The label depends on wall-clock time, so it's computed inside the ticker
  // (and on poll-time changes) rather than during render.
  const [label, setLabel] = useState(() => pollLabel(lastPollTime));

  useEffect(() => {
    const update = () => setLabel(pollLabel(lastPollTime));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastPollTime]);

  return (
    <div className="bottom-bar">
      <span>Overhead v1.0</span>
      <span>{label}</span>
    </div>
  );
}
