import { useState, type FormEvent } from 'react';
import { apiLogin } from '../services/api';
import type { AuthUser } from '../hooks/useAuth';

interface Props {
  onLogin: (token: string, user: AuthUser) => void;
  onShowRegister: () => void;
  onShowForgotPassword: () => void;
  onBackToGuest?: () => void;
}

export default function LoginScreen({ onLogin, onShowRegister, onShowForgotPassword, onBackToGuest }: Props) {
  const [email,    setEmail   ] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError   ] = useState('');
  const [loading,  setLoading ] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await apiLogin(email, password);
      onLogin(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
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
        <p className="auth-subtitle">Catch the flights overhead — sign in to continue</p>

        <form className="auth-form" onSubmit={handleSubmit}>
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
          <label className="auth-label">
            Password
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="auth-forgot-row">
            <button type="button" className="auth-link" onClick={onShowForgotPassword}>
              Forgot password?
            </button>
          </div>
        </form>

        <p className="auth-switch">
          Don't have an account?{' '}
          <button className="auth-link" onClick={onShowRegister}>
            Request access
          </button>
        </p>

        {onBackToGuest && (
          <p className="auth-switch">
            <button className="auth-link" onClick={onBackToGuest}>
              ← Back to guest view
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
