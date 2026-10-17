import { useSyncExternalStore } from 'react';
import { motionAllowed, onMotionPreferenceChange } from '../utils/motion';

/** Whether ambient animation may run — follows the OS reduced-motion setting live. */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(onMotionPreferenceChange, motionAllowed, () => false);
}
