import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Moon, Sun } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { shouldRefreshAuthOptions, useAuthOptions } from '../lib/onboarding';
import { useTurnstileProof } from '../lib/turnstile-proof';
import { Turnstile } from '../components/Turnstile';
import { AuthSettingsNotice } from '../components/AuthSettingsNotice';
import { Button } from '../components/Ui';
import { useAuth } from '../lib/auth';
import { publicSiteHref } from '../lib/public-site';
import { useTheme } from '../lib/theme';
import { resolveConsoleReturnPath } from '@kineticrouter/platform-config/routes';

export function SignInPage() {
  const { authenticated, loading, login, completeTotp } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const options = useAuthOptions();
  const verification = useTurnstileProof(options.data?.turnstile, theme);
  const requestPending = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [challenge, setChallenge] = useState<{ token: string; maskedEmail?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(() => {
    const error = new URLSearchParams(location.search).get('error');
    return error === 'google_cancelled' ? 'Google sign-in was cancelled. You can try again.' : error === 'google_failed' ? 'Google sign-in could not be completed. Please try again.' : '';
  });

  const next = resolveSignInNext(location.search, location.state);
  if (!loading && authenticated) return <Navigate to={next} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (requestPending.current) return;
    if (!challenge && (options.isError || !verification.ready)) { setMessage('Please wait for verification before signing in.'); return; }
    requestPending.current = true;
    setMessage('');
    setSubmitting(true);
    try {
      const result = challenge
        ? await completeTotp(challenge.token, totpCode)
        : await login(email.trim(), password, verification.consume());
      if (result.requires2fa) {
        setChallenge({ token: result.tempToken, maskedEmail: result.maskedEmail });
      } else {
        navigate(next, { replace: true });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in failed.');
      if (shouldRefreshAuthOptions(error)) void options.refetch();
    } finally {
      if (!challenge) verification.reset();
      requestPending.current = false;
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
          <GoogleSignInButton next={next} onError={setMessage} />
          <div className="auth-divider"><span>or continue with email</span></div>
        </>}
        <form onSubmit={submit} className="auth-form">
          {!challenge ? <>
            <label>Email address<input disabled={submitting} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" type="email" placeholder="you@example.com" required autoFocus /></label>
            <label>Password<div className="password-field"><input disabled={submitting} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          </> : <label>Authenticator code<input disabled={submitting} className="totp-input" value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" pattern="\d{6}" placeholder="000000" required autoFocus /></label>}
          {!challenge && <>
            <AuthSettingsNotice options={options.data} pending={options.isPending} failed={options.isError} retrying={options.isFetching} onRetry={() => { void options.refetch(); }} />
            {!options.isError && options.data?.turnstile?.enabled && options.data.turnstile.siteKey && <Turnstile siteKey={options.data.turnstile.siteKey} theme={theme} resetKey={verification.resetKey} onTokenChange={verification.onTokenChange} />}
          </>}
          {message && <div className="auth-message" role="status">{message}</div>}
          <Button className="auth-submit" disabled={submitting || (!challenge && (options.isError || !verification.ready))}>{submitting ? <LoaderCircle className="spin" size={17} /> : <>{challenge ? 'Verify and sign in' : 'Sign in'}<ArrowRight size={17} /></>}</Button>
          {challenge && <button className="auth-back" type="button" disabled={submitting} onClick={() => { verification.reset(); setChallenge(null); setTotpCode(''); setMessage(''); }}>Back to password sign in</button>}
          {!challenge && options.data?.emailSignup && <Link className="auth-back" to={`/sign-up?next=${encodeURIComponent(next)}`}>New to kineticRouter? Create an account</Link>}
        </form>
      </section>
      <p className="auth-legal">By continuing, you agree to the <a href={publicSiteHref('/terms-of-service')}>Terms of Service</a> and <a href={publicSiteHref('/privacy')}>Privacy Policy</a>.</p>
    </main>
  </div>;
}

function resolveSignInNext(search: string, state: unknown) {
  const queryNext = new URLSearchParams(search).get('next');
  if (queryNext) return resolveConsoleReturnPath(queryNext);
  if (state && typeof state === 'object' && 'from' in state) return resolveConsoleReturnPath(state.from);
  return resolveConsoleReturnPath(undefined);
}
