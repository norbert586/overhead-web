import { useState, type FormEvent } from 'react';
import { apiForgotPassword } from '../services/api';

interface Props {
  onBackToLogin: () => void;
}

export default function ForgotPasswordScreen({ onBackToLogin }: Props) {
  const [email,   setEmail  ] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiForgotPassword(email);
    } finally {
      setLoading(false);
      // Always show the "check your inbox" message, even on network error —
      // we don't want to leak whether the email is registered.
      setSubmitted(true);
    }
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
        <p className="auth-subtitle">Reset your password</p>

        {submitted ? (
          <>
            <p className="auth-help">
              If an account exists for <strong>{email}</strong>, a reset link is on
              its way. Check your inbox (and spam folder) — the link is valid for
              one hour.
            </p>
            <button className="auth-btn" onClick={onBackToLogin}>
              Back to sign in
            </button>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <p className="auth-help">
              Enter the email you signed up with. We'll send a reset link if the
              account exists.
            </p>
            <label className="auth-label">
              Email
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <p className="auth-switch">
              <button type="button" className="auth-link" onClick={onBackToLogin}>
                Back to sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
