import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PortalShell } from './components/PortalShell';
import { LoadingState } from './components/Ui';
import { useAuth } from './lib/auth';
import { SignInPage } from './pages/SignInPage';
import { DashboardPage } from './pages/DashboardPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { UsagePage } from './pages/UsagePage';
import { StatusPage } from './pages/StatusPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { RedeemPage } from './pages/RedeemPage';
import { ProfilePage } from './pages/ProfilePage';

export function App() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <div className="app-loading"><span className="brand-mark app-loading-mark" /><LoadingState label="Opening your console" /></div>;
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
