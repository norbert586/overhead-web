import { useState, useCallback } from 'react';

const TOKEN_KEY = 'overhead_token';
const USER_KEY  = 'overhead_user';

export interface AuthUser {
  id: number;
  email: string;
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(loadUser);

  const login = useCallback((token: string, u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  return { user, isAuthenticated: !!user, login, logout };
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
