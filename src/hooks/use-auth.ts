'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiResponse, SessionUser } from '@/types';
import { API_ROUTES, ROUTES } from '@/lib/constants';

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<ApiResponse<SessionUser>>;
  register: (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
  ) => Promise<ApiResponse<SessionUser>>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within <AuthProvider>');
  return context;
}

async function readSession(signal?: AbortSignal): Promise<SessionUser | null> {
  const res = await fetch(API_ROUTES.auth.session, { signal });
  const data: ApiResponse<SessionUser> = await res.json();
  return data.success && data.data ? data.data : null;
}

export function useAuthProvider(): AuthContextValue {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  /**
   * Reads the session once on mount.
   *
   * The request is inlined here rather than calling `refreshSession`,
   * so every state update happens after an await — a synchronous
   * setState in an effect body triggers a second render pass before
   * the browser has painted.
   */
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const session = await readSession(controller.signal);
        if (!controller.signal.aborted) setUser(session);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setUser(null);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setUser(await readSession());
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<ApiResponse<SessionUser>> => {
      const res = await fetch(API_ROUTES.auth.login, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data: ApiResponse<SessionUser> = await res.json();
      if (data.success && data.data) setUser(data.data);
      return data;
    },
    []
  );

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      confirmPassword: string
    ): Promise<ApiResponse<SessionUser>> => {
      const res = await fetch(API_ROUTES.auth.register, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, confirmPassword }),
      });
      const data: ApiResponse<SessionUser> = await res.json();
      if (data.success && data.data) setUser(data.data);
      return data;
    },
    []
  );

  const logout = useCallback(async () => {
    await fetch(API_ROUTES.auth.logout, { method: 'POST' });
    setUser(null);
    router.push(ROUTES.login);
    // Server components hold session-derived data; refresh so they
    // re-render without it.
    router.refresh();
  }, [router]);

  return {
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    login,
    register,
    logout,
    refreshSession,
  };
}
