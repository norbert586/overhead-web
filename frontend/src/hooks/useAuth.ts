import { useState, useCallback } from 'react';

const TOKEN_KEY = 'overhead_token';
const USER_KEY  = 'overhead_user';

export interface AuthUser {
  id: number;
  email: string;
  isAdmin?: boolean;
  emailVerified?: boolean;
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

  // Used to fold in fields the server returns later (e.g. isAdmin) without
  // logging the user out.
  const refreshUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { user, isAuthenticated: !!user, login, logout, refreshUser };
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
