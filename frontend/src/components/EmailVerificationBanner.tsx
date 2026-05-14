import { useState } from 'react';
import { apiResendVerification } from '../services/api';

interface Props {
  email: string;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

export default function EmailVerificationBanner({ email }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error,  setError ] = useState('');

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
          ? <>Verification email sent to <strong>{email}</strong>. Check your inbox.</>
          : <>Confirm <strong>{email}</strong> to enable password recovery.</>}
      </span>
      {status !== 'sent' && (
        <button
          className="verify-banner-btn"
          onClick={handleResend}
          disabled={status === 'sending'}
        >
          {status === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
      )}
      {status === 'error' && <span className="verify-banner-error">{error}</span>}
    </div>
  );
}
