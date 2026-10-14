import { useState } from 'react';
import { apiResendVerification } from '../services/api';

interface Props {
  email: string;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

// Dismissing hides the reminder until the app is next opened — it's a
// nudge, not something to stare at every time you go outside.
const DISMISS_KEY = 'overhead_verify_dismissed';
function wasDismissed(): boolean {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

export default function EmailVerificationBanner({ email }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error,  setError ] = useState('');
  const [hidden, setHidden] = useState(wasDismissed);

  if (hidden) return null;

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* hide for now only */ }
    setHidden(true);
  }

  async function handleResend() {
    setStatus('sending');
    setError('');
    try {
      await apiResendVerification();
      setStatus('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend');
      setStatus('error');
    }
  }

  return (
    <div className="verify-banner" role="status">
      <span className="verify-banner-text">
        {status === 'sent'
          ? <>Sent. Check <strong>{email}</strong> for the link.</>
          : <>Confirm <strong>{email}</strong> for password resets.</>}
      </span>
      {status !== 'sent' && (
        <button
          className="verify-banner-btn"
          onClick={handleResend}
          disabled={status === 'sending'}
        >
          {status === 'sending' ? 'Sending…' : 'Send link'}
        </button>
      )}
      {status === 'error' && <span className="verify-banner-error">{error}</span>}
      <button type="button" className="verify-banner-close" onClick={dismiss} aria-label="Hide for now">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
