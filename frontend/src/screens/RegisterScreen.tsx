import { useState, type FormEvent } from 'react';
import { apiRegister } from '../services/api';
import type { AuthUser } from '../hooks/useAuth';
import AuthShell from '../components/AuthShell';

interface Props {
  onLogin: (token: string, user: AuthUser) => void;
  onShowLogin: () => void;
  onBackToGuest?: () => void;
}

export default function RegisterScreen({ onLogin, onShowLogin, onBackToGuest }: Props) {
  const [email,      setEmail     ] = useState('');
  const [password,   setPassword  ] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error,      setError     ] = useState('');
  const [loading,    setLoading   ] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await apiRegister(email, password, inviteCode);
      onLogin(token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create your account">

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
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          <label className="auth-label">
            Invite code
            <input
              className="auth-input"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              autoComplete="off"
              required
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <button className="auth-link" onClick={onShowLogin}>
            Sign in
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
