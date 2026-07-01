import { useEffect, useState } from 'react';

/**
 * Tracks whether the page is currently visible (tab in the foreground).
 *
 * The catch model only records while you're actually on the page — switching
 * tabs or backgrounding the browser pauses polling entirely, so an idle tab
 * can't keep catching flights for you.
 */
export function usePageVisibility(): boolean {
  const [visible, setVisible] = useState(
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  );

  useEffect(() => {
    function handleChange() {
      setVisible(document.visibilityState !== 'hidden');
    }
    document.addEventListener('visibilitychange', handleChange);
    return () => document.removeEventListener('visibilitychange', handleChange);
  }, []);

  return visible;
}
