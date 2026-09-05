import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AnalyticsTracker } from './components/AnalyticsTracker';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { applyTheme, readStoredTheme } from '@kineticrouter/platform-config/theme';
import '@kineticrouter/brand-ui/brand.css';
import './styles.css';

// Select the correct high-contrast logo before React's first paint.
let themeStorage: Storage | undefined;
try { themeStorage = window.localStorage; } catch { /* Dark remains the safe default. */ }
applyTheme(document.documentElement, readStoredTheme(themeStorage));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (attempt, error) => attempt < 1 && !(error instanceof Error && error.message.includes('Sign in')),
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <App />
            <AnalyticsTracker />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
