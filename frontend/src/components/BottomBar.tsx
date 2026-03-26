import { useState, useEffect } from 'react';

interface BottomBarProps {
  lastPollTime: Date | null;
}

export default function BottomBar({ lastPollTime }: BottomBarProps) {
  // Re-render every second so the "Xs ago" label stays current
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  let pollLabel = 'No data yet';
  if (lastPollTime) {
    const sec = Math.floor((Date.now() - lastPollTime.getTime()) / 1000);
    pollLabel = `Last poll: ${sec}s ago`;
  }

  return (
    <div className="bottom-bar">
      <span>Overhead v1.0</span>
      <span>{pollLabel}</span>
    </div>
  );
}
