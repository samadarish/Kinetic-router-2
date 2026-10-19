import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AnalyticsTracker } from './components/AnalyticsTracker';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';
import { applyTheme, readBrowserTheme } from '@kineticrouter/platform-config/theme';
import { shouldRetryQuery } from './lib/query-policy';
import { applyLocale, readBrowserLocale } from '@kineticrouter/platform-config/locale';
import { loadCatalog } from '@kineticrouter/i18n';
import { LocaleProvider } from '@kineticrouter/i18n/react';
import '@kineticrouter/brand-ui/brand.css';
import './styles.css';

// Select the correct high-contrast logo before React's first paint.
applyTheme(document.documentElement, readBrowserTheme());
const locale = readBrowserLocale();
applyLocale(document.documentElement, locale);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

async function openConsole() {
  let initialLocale = locale;
  const messages = await loadCatalog(locale, 'console').catch(() => { initialLocale = 'en'; return {}; });
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider namespace="console" initialLocale={initialLocale} initialMessages={messages}>
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
    </LocaleProvider>
  </StrictMode>,
);
}
void openConsole();
