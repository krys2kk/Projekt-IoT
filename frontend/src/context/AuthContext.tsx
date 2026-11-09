import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onUnauthorized, setToken, getToken } from '../api/client';
import { api } from '../api/endpoints';
import type { SessionUser } from '../api/types';

const USER_KEY = 'iot.session';

interface AuthApi {
  user: SessionUser | null;
  /** secret = hasło lub PIN */
  login: (login: string, secret: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthApi | null>(null);

function readUser(): SessionUser | null {
  if (!getToken()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(readUser);

  const logout = useCallback(() => {
    setToken(null);
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  useEffect(() => {
    onUnauthorized(logout);
    return () => onUnauthorized(null);
  }, [logout]);

  const login = useCallback(async (l: string, secret: string) => {
    const res = await api.login(l, secret);
    const session: SessionUser = { id: res.user_id, login: res.login, rola: res.rola };
    setToken(res.access_token);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
    setUser(session);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth poza AuthProvider');
  return ctx;
}
