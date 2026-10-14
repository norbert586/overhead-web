import { useEffect, useState } from 'react';
import { apiVerifyEmail } from '../services/api';
import AuthShell from '../components/AuthShell';

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
    <AuthShell title="Confirm your email">

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
    </AuthShell>
  );
}
