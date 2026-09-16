import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PortalShell, RouteBoundary } from './components/PortalShell';
import { ErrorState, LoadingState } from './components/Ui';
import { useAuth } from './lib/auth';
import { PlaygroundGate, PlaygroundProvider } from './lib/playground-context';
import { SignInPage } from './pages/SignInPage';
const SignUpPage = lazy(() => import('./pages/SignUpPage').then(module => ({ default: module.SignUpPage })));

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage').then((module) => ({ default: module.ApiKeysPage })));
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage').then((module) => ({ default: module.PlaygroundPage })));
const PlaygroundSettingsPage = lazy(() => import('./pages/PlaygroundSettingsPage').then((module) => ({ default: module.PlaygroundSettingsPage })));
const PlaygroundChatsPage = lazy(() => import('./pages/PlaygroundChatsPage').then(module => ({ default: module.PlaygroundChatsPage })));
const UsagePage = lazy(() => import('./pages/UsagePage').then((module) => ({ default: module.UsagePage })));
const StatusPage = lazy(() => import('./pages/StatusPage').then((module) => ({ default: module.StatusPage })));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage').then((module) => ({ default: module.SubscriptionsPage })));
const RedeemPage = lazy(() => import('./pages/RedeemPage').then((module) => ({ default: module.RedeemPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(module => ({ default: module.AnalyticsPage })));
const MetricsPage = lazy(() => import('./pages/MetricsPage').then(module => ({ default: module.MetricsPage })));
const WebsiteSettingsPage = lazy(() => import('./pages/WebsiteSettingsPage').then(module => ({ default: module.WebsiteSettingsPage })));

export function App() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <div className="app-loading"><span className="brand-mark app-loading-mark" /><LoadingState label="Opening your console" /></div>;
  if (auth.error) return <div className="app-loading"><ErrorState error={auth.error} retry={() => void auth.refresh()} /></div>;
  return <Routes>
    <Route path="/sign-in" element={<SignInPage />} />
    <Route path="/sign-up" element={<RouteBoundary key="email"><Suspense fallback={<LoadingState label="Loading page" />}><SignUpPage /></Suspense></RouteBoundary>} />
    <Route path="/auth/google/complete" element={<RouteBoundary key="google"><Suspense fallback={<LoadingState label="Loading page" />}><SignUpPage google /></Suspense></RouteBoundary>} />
    <Route element={auth.authenticated && auth.user ? <PlaygroundProvider key={auth.user.id} userId={auth.user.id}><PortalShell /></PlaygroundProvider> : <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/api-keys" element={<ApiKeysPage />} />
      <Route path="/playground" element={auth.playgroundEnabled ? <PlaygroundGate><PlaygroundPage /></PlaygroundGate> : <Navigate to="/dashboard" replace />} />
      <Route path="/admin/playground" element={auth.user?.role === 'admin' && auth.user.status === 'active' ? <PlaygroundSettingsPage /> : <ErrorState error={new Error('Administrator access is required.')} />} />
      <Route path="/admin/playground/chats" element={auth.user?.role === 'admin' && auth.user.status === 'active' ? <PlaygroundChatsPage /> : <ErrorState error={new Error('Administrator access is required.')} />} />
      <Route path="/admin/website" element={auth.user?.role === 'admin' && auth.user.status === 'active' ? <WebsiteSettingsPage /> : <ErrorState error={new Error('Administrator access is required.')} />} />
      <Route path="/usage" element={<UsagePage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="/subscriptions" element={<SubscriptionsPage />} />
      <Route path="/redeem" element={<RedeemPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/analytics" element={auth.user?.role === 'admin' && auth.user.status === 'active' ? <AnalyticsPage /> : <ErrorState error={new Error('Administrator access is required.')} />} />
      <Route path="/admin/metrics" element={auth.user?.role === 'admin' && auth.user.status === 'active' ? <MetricsPage /> : <ErrorState error={new Error('Administrator access is required.')} />} />
    </Route>
    <Route path="/" element={<Navigate to={auth.authenticated ? '/dashboard' : '/sign-in'} replace />} />
    <Route path="*" element={<Navigate to={auth.authenticated ? '/dashboard' : '/sign-in'} replace />} />
  </Routes>;
}
