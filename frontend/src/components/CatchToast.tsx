import { useEffect } from 'react';

export interface CatchToastData {
  id: number;
  label: string;
  detail: string;
  isNew: boolean;
  rare: boolean;
}

/**
 * Catching carries on while you browse the log or stats; this is how you
 * hear about it. Tapping it goes to the catch screen. Gone after 5 s.
 */
export default function CatchToast({ toast, onOpen, onDone }: {
  toast: CatchToastData;
  onOpen: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [toast.id, onDone]);

  return (
    <button
      type="button"
      className={`catch-toast${toast.isNew ? ' catch-toast--new' : ''}${toast.rare ? ' catch-toast--rare' : ''}`}
      onClick={() => { onOpen(); onDone(); }}
      role="status"
    >
      <span className="catch-toast-mark" aria-hidden="true">{toast.isNew ? 'New' : 'Caught'}</span>
      <span className="catch-toast-text">
        <strong>{toast.label}</strong>
        <span>{toast.detail}</span>
      </span>
    </button>
  );
}
