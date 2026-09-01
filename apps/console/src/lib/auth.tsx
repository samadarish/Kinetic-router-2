import { createContext, useContext, useEffect, type PropsWithChildren } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CapabilityMap, PortalUser, SessionView } from '@kineticrouter/portal-contract';
import { jsonBody, portalApi, setCsrfToken } from './api';

type LoginResult =
  | { requires2fa: true; tempToken: string; maskedEmail?: string }
  | { requires2fa: false; user: PortalUser; csrfToken: string; capabilities: CapabilityMap };

type AuthContextValue = {
  loading: boolean;
  authenticated: boolean;
  user?: PortalUser;
  capabilities?: CapabilityMap;
  login(email: string, password: string): Promise<LoginResult>;
  completeTotp(tempToken: string, code: string): Promise<LoginResult>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => portalApi<SessionView>('/auth/session'),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    setCsrfToken(session.data?.csrfToken);
  }, [session.data?.csrfToken]);

  useEffect(() => {
    const unauthorized = () => {
      setCsrfToken();
      client.setQueryData<SessionView>(['session'], {
        authenticated: false,
        capabilities: session.data?.capabilities ?? emptyCapabilities,
      });
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    };
    window.addEventListener('portal:unauthorized', unauthorized);
    return () => window.removeEventListener('portal:unauthorized', unauthorized);
  }, [client, session.data?.capabilities]);

  async function finishLogin(result: LoginResult) {
    if (!result.requires2fa) {
      setCsrfToken(result.csrfToken);
      client.setQueryData<SessionView>(['session'], {
        authenticated: true,
        csrfToken: result.csrfToken,
        user: result.user,
        capabilities: result.capabilities,
      });
    }
    return result;
  }

  const value: AuthContextValue = {
    loading: session.isLoading,
    authenticated: Boolean(session.data?.authenticated),
    user: session.data?.user,
    capabilities: session.data?.capabilities,
    login: async (email, password) => finishLogin(await portalApi<LoginResult>('/auth/password/login', {
      method: 'POST', ...jsonBody({ email, password }),
    })),
    completeTotp: async (tempToken, code) => finishLogin(await portalApi<LoginResult>('/auth/totp', {
      method: 'POST', ...jsonBody({ tempToken, code }),
    })),
    logout: async () => {
      try {
        await portalApi('/auth/logout', { method: 'POST', ...jsonBody({}) });
      } finally {
        setCsrfToken();
        client.clear();
        await client.prefetchQuery({ queryKey: ['session'], queryFn: () => portalApi<SessionView>('/auth/session') });
      }
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
