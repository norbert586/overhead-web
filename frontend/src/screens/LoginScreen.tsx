import { useState, type FormEvent } from 'react';
import { apiLogin } from '../services/api';
import type { AuthUser } from '../hooks/useAuth';
import AuthShell from '../components/AuthShell';

interface Props {
  onLogin: (token: string, user: AuthUser) => void;
  onShowRegister: () => void;
  onShowForgotPassword: () => void;
  onBackToGuest?: () => void;
  /** Why the user is here, e.g. their session expired. */
  notice?: string | null;
}

export default function LoginScreen({ onLogin, onShowRegister, onShowForgotPassword, onBackToGuest, notice }: Props) {
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
    <AuthShell title="Sign in">
        {notice && <p className="auth-notice" role="status">{notice}</p>}

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
              Back to the live view
            </button>
          </p>
        )}
    </AuthShell>
  );
}
