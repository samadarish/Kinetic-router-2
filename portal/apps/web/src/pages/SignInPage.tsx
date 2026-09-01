import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Moon, Sun } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Button } from '../components/Ui';
import { useAuth } from '../lib/auth';
import { publicSiteHref } from '../lib/public-site';
import { useTheme } from '../lib/theme';

export function SignInPage() {
  const { authenticated, loading, login, completeTotp } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [challenge, setChallenge] = useState<{ token: string; maskedEmail?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  if (!loading && authenticated) return <Navigate to={safeNext(location.state)} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      const result = challenge
        ? await completeTotp(challenge.token, totpCode)
        : await login(email.trim(), password);
      if (result.requires2fa) {
        setChallenge({ token: result.tempToken, maskedEmail: result.maskedEmail });
      } else {
        navigate(safeNext(location.state), { replace: true });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="auth-page">
    <div className="auth-orb auth-orb-one" /><div className="auth-orb auth-orb-two" />
    <button className="auth-theme" aria-label="Toggle color theme" onClick={toggle}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
    <main className="auth-panel">
      <a href={publicSiteHref('/')} aria-label="kineticRouter home" className="auth-brand"><Brand className="auth-wordmark" /></a>
      <section className="auth-card">
        <header><span className="auth-kicker">CUSTOMER CONSOLE</span><h1>{challenge ? 'Two-step verification' : 'Welcome back'}</h1><p>{challenge ? `Enter the code from your authenticator${challenge.maskedEmail ? ` for ${challenge.maskedEmail}` : ''}.` : 'Sign in to manage your kineticRouter account.'}</p></header>
        {!challenge && <>
          <button type="button" className="google-button" onClick={() => setMessage('Google sign-in is coming soon.')}><GoogleMark /> Continue with Google <span>Coming soon</span></button>
          <div className="auth-divider"><span>or continue with email</span></div>
        </>}
        <form onSubmit={submit} className="auth-form">
          {!challenge ? <>
            <label>Email address<input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" type="email" placeholder="you@example.com" required autoFocus /></label>
            <label>Password<div className="password-field"><input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          </> : <label>Authenticator code<input className="totp-input" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" pattern="\d{6}" placeholder="000000" required autoFocus /></label>}
          {message && <div className="auth-message" role="status">{message}</div>}
          <Button className="auth-submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={17} /> : <>{challenge ? 'Verify and sign in' : 'Sign in'}<ArrowRight size={17} /></>}</Button>
          {challenge && <button className="auth-back" type="button" onClick={() => { setChallenge(null); setTotpCode(''); setMessage(''); }}>Back to password sign in</button>}
        </form>
      </section>
      <p className="auth-legal">By continuing, you agree to the <a href={publicSiteHref('/terms-of-service')}>Terms of Service</a> and <a href={publicSiteHref('/privacy')}>Privacy Policy</a>.</p>
    </main>
  </div>;
}

function safeNext(state: unknown) {
  if (state && typeof state === 'object' && 'from' in state && typeof state.from === 'string' && state.from.startsWith('/')) return state.from;
  return '/dashboard';
}

function GoogleMark() {
  return <span className="google-mark" aria-hidden="true"><i /><i /><i /><i /></span>;
}
