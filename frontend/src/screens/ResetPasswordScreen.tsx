import { useState, type FormEvent } from 'react';
import { apiResetPassword } from '../services/api';
import type { AuthUser } from '../hooks/useAuth';

interface Props {
  token: string;
  onLogin: (token: string, user: AuthUser) => void;
  onBackToLogin: () => void;
}

export default function ResetPasswordScreen({ token, onLogin, onBackToLogin }: Props) {
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm ] = useState('');
  const [error,    setError   ] = useState('');
  const [loading,  setLoading ] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { token: authToken, user } = await apiResetPassword(token, password);
      onLogin(authToken, user);
      // Clear the token out of the URL so a refresh doesn't try to redeem it
      // again (the backend has already marked it used and would 410).
      window.history.replaceState({}, '', window.location.pathname);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setLoading(false);
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
        <p className="auth-subtitle">Choose a new password</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label">
            New password
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          <label className="auth-label">
            Confirm password
            <input
              className="auth-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Updating…' : 'Set new password'}
          </button>

          <p className="auth-switch">
            <button type="button" className="auth-link" onClick={onBackToLogin}>
              Back to sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
