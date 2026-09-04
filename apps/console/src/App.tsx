import { lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PortalShell } from './components/PortalShell';
import { ErrorState, LoadingState } from './components/Ui';
import { useAuth } from './lib/auth';
import { SignInPage } from './pages/SignInPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage').then((module) => ({ default: module.ApiKeysPage })));
const UsagePage = lazy(() => import('./pages/UsagePage').then((module) => ({ default: module.UsagePage })));
const StatusPage = lazy(() => import('./pages/StatusPage').then((module) => ({ default: module.StatusPage })));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage').then((module) => ({ default: module.SubscriptionsPage })));
const RedeemPage = lazy(() => import('./pages/RedeemPage').then((module) => ({ default: module.RedeemPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));

export function App() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <div className="app-loading"><span className="brand-mark app-loading-mark" /><LoadingState label="Opening your console" /></div>;
  if (auth.error) return <div className="app-loading"><ErrorState error={auth.error} retry={() => void auth.refresh()} /></div>;
  return <Routes>
    <Route path="/sign-in" element={<SignInPage />} />
    <Route element={auth.authenticated ? <PortalShell /> : <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/api-keys" element={<ApiKeysPage />} />
      <Route path="/usage" element={<UsagePage />} />
      <Route path="/status" element={<StatusPage />} />
      <Route path="/subscriptions" element={<SubscriptionsPage />} />
      <Route path="/redeem" element={<RedeemPage />} />
      <Route path="/profile" element={<ProfilePage />} />
    </Route>
    <Route path="/" element={<Navigate to={auth.authenticated ? '/dashboard' : '/sign-in'} replace />} />
    <Route path="*" element={<Navigate to={auth.authenticated ? '/dashboard' : '/sign-in'} replace />} />
  </Routes>;
}
