import { useEffect, useState } from 'react';
import { apiVerifyEmail } from '../services/api';

interface Props {
  token: string;
  onContinue: () => void;
}

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmailScreen({ token, onContinue }: Props) {
  const [status, setStatus] = useState<Status>('verifying');
  const [error,  setError ] = useState('');

  useEffect(() => {
    apiVerifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Verification failed');
        setStatus('error');
      });
  }, [token]);

  function handleContinue() {
    // Strip the token so a refresh doesn't try to re-verify.
    window.history.replaceState({}, '', window.location.pathname);
    onContinue();
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="var(--accent)" aria-hidden>
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
          <span className="auth-wordmark">OVERHEAD</span>
        </div>

        {status === 'verifying' && (
          <>
            <p className="auth-subtitle">Confirming your email…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <p className="auth-subtitle">Email confirmed</p>
            <p className="auth-help">
              Your email is verified. You can close this tab or continue to the app.
            </p>
            <button className="auth-btn" onClick={handleContinue}>
              Continue
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="auth-subtitle">Couldn't verify email</p>
            <p className="auth-error">{error}</p>
            <p className="auth-help">
              The link may have expired or already been used. Sign in and request a
              fresh one from the verification banner.
            </p>
            <button className="auth-btn" onClick={handleContinue}>
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
