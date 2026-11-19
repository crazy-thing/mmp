import type { AdminUser } from '@mmp/schema';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, setUnauthorizedHandler } from './api';

interface AuthState {
  status: 'loading' | 'needs-setup' | 'signed-out' | 'signed-in';
  user: AdminUser | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<AdminUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
      setStatus('signed-in');
    } catch {
      setUser(null);
      const setup = await api.setupStatus().catch(() => ({ needsSetup: false }));
      setStatus(setup.needsSetup ? 'needs-setup' : 'signed-out');
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setStatus('signed-out');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('signed-out');
    });
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ status, user, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Sends visitors to setup or sign-in as needed before showing a page. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return null;
  if (status === 'needs-setup') return <Navigate to="/setup" replace />;
  if (status === 'signed-out') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <>{children}</>;
}
