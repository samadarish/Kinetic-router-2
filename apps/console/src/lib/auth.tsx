import { createContext, useContext, useEffect, type PropsWithChildren } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CapabilityMap, PortalUser, SessionView, SignupInput, GoogleRegistrationInput } from '@kineticrouter/portal-contract';
import { jsonBody, portalApi, setCsrfToken } from './api';
import { applyLoggedOutQueryState, applyMetricsAuthorizationState } from './auth-cache';
import { browserPlaygroundStorage, clearAllPlaygroundStorage } from './playground-browser-storage';
import { clearSupportDrafts } from './support-stream';

type LoginResult =
  | { requires2fa: true; tempToken: string; maskedEmail?: string }
  | { requires2fa: false; user: PortalUser; csrfToken: string; capabilities: CapabilityMap; playgroundEnabled: boolean };

type AuthContextValue = {
  loading: boolean;
  error?: unknown;
  authenticated: boolean;
  playgroundEnabled: boolean;
  user?: PortalUser;
  capabilities?: CapabilityMap;
  login(email: string, password: string): Promise<LoginResult>;
  completeTotp(tempToken: string, code: string): Promise<LoginResult>;
  register(input: SignupInput): Promise<LoginResult>;
  completeGoogle(input: GoogleRegistrationInput): Promise<LoginResult & { next: string }>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => portalApi<SessionView>('/auth/session', { signal }),
    staleTime: 60_000,
    retry: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!session.data?.authenticated) return;
    const timers = [1_500, 10_000].map((delay) => window.setTimeout(() => { void session.refetch(); }, delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [session.data?.authenticated]);

  useEffect(() => {
    setCsrfToken(session.data?.csrfToken);
    if (session.data && !session.data.authenticated) {
      clearAllPlaygroundStorage(browserPlaygroundStorage());
      try { clearSupportDrafts(window.sessionStorage); } catch { /* Restricted storage. */ }
    }
  }, [session.data?.csrfToken, session.data?.authenticated]);

  useEffect(() => {
    if (session.data) void applyMetricsAuthorizationState(client, session.data);
  }, [client, session.data]);

  useEffect(() => {
    const unauthorized = () => {
      setCsrfToken();
      void applyLoggedOutQueryState(client, session.data?.capabilities ?? emptyCapabilities);
    };
    window.addEventListener('portal:unauthorized', unauthorized);
    return () => window.removeEventListener('portal:unauthorized', unauthorized);
  }, [client, session.data?.capabilities]);

  async function finishLogin(result: LoginResult) {
    if (!result.requires2fa) {
      await client.cancelQueries();
      client.removeQueries({ predicate: query => query.queryKey[0] !== 'session' });
      clearAllPlaygroundStorage(browserPlaygroundStorage());
      try { clearSupportDrafts(window.sessionStorage); } catch { /* Restricted storage. */ }
      setCsrfToken(result.csrfToken);
      client.setQueryData<SessionView>(['session'], {
        authenticated: true,
        playgroundEnabled: result.playgroundEnabled === true,
        csrfToken: result.csrfToken,
        user: result.user,
        capabilities: result.capabilities,
      });
    }
    return result;
  }

  const value: AuthContextValue = {
    loading: session.isLoading,
    error: session.data ? undefined : session.error,
    authenticated: Boolean(session.data?.authenticated),
    playgroundEnabled: !session.isError && session.data?.playgroundEnabled === true,
    user: session.data?.user,
    capabilities: session.data?.capabilities,
    login: async (email, password) => finishLogin(await portalApi<LoginResult>('/auth/password/login', {
      method: 'POST', ...jsonBody({ email, password }),
    })),
    completeTotp: async (tempToken, code) => finishLogin(await portalApi<LoginResult>('/auth/totp', {
      method: 'POST', ...jsonBody({ tempToken, code }),
    })),
    register: async input => finishLogin(await portalApi<LoginResult>('/auth/email/register', { method: 'POST', ...jsonBody(input) })),
    completeGoogle: async input => {
      const result = await portalApi<LoginResult & { next: string }>('/auth/google/complete', { method: 'POST', ...jsonBody(input) });
      await finishLogin(result);
      return result;
    },
    logout: async () => {
      window.dispatchEvent(new CustomEvent('portal:signing-out'));
      await portalApi('/auth/logout', { method: 'POST', ...jsonBody({}) });
      window.dispatchEvent(new CustomEvent('portal:signed-out'));
      setCsrfToken();
      await applyLoggedOutQueryState(client, session.data?.capabilities ?? emptyCapabilities);
    },
    refresh: async () => { await session.refetch(); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

const emptyCapabilities: CapabilityMap = {
  registration: false, passwordReset: false, totp: false, passkeys: false, google: false,
  payments: false, subscriptionPurchase: false, modelPlaza: false, availableChannels: false,
  channelMonitor: true, channelMonitorMode: 'v1', affiliate: false, usageErrors: false,
  promoCode: true, keyWrites: false, profileWrites: false, redeemWrites: false,
  announcementWrites: false,
};
