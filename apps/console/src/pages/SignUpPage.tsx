import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Moon, Sun } from 'lucide-react';
import { signupInputSchema, googleRegistrationSchema, verificationCodeInputSchema, type GoogleRegistrationView } from '@kineticrouter/portal-contract';
import { resolveConsoleReturnPath } from '@kineticrouter/platform-config/routes';
import { Brand } from '../components/Brand';
import { Button } from '../components/Ui';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { jsonBody, portalApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { shouldRefreshAuthOptions, useAuthOptions } from '../lib/onboarding';
import { useTurnstileProof } from '../lib/turnstile-proof';
import { Turnstile } from '../components/Turnstile';
import { AuthSettingsNotice } from '../components/AuthSettingsNotice';
import { publicSiteHref } from '../lib/public-site';
import { useTheme } from '../lib/theme';

export function SignUpPage({ google = false }: { google?: boolean }) {
  const auth = useAuth();
  const options = useAuthOptions();
  const { theme, toggle } = useTheme();
  const verification = useTurnstileProof(options.data?.turnstile, theme);
  const requestPending = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const next = resolveConsoleReturnPath(new URLSearchParams(location.search).get('next'));
  const pending = useQuery({ queryKey: ['google-registration'], queryFn: ({ signal }) => portalApi<GoogleRegistrationView>('/auth/google/registration', { signal }), enabled: google && !auth.authenticated, retry: false, staleTime: 0 });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [invitationCode, setInvitationCode] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [resendRequested, setResendRequested] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);
  if (!auth.loading && auth.authenticated) return <Navigate to={next} replace />;
  const ready = !options.isError && (google ? Boolean(pending.data && options.data?.googleSignin) : options.data?.emailSignup === true);
  const checking = options.isPending || (google && pending.isPending);
  const invitationRequired = google ? pending.data?.invitationRequired : options.data?.invitationRequired;
  const unavailable = pending.error instanceof Error ? pending.error.message : 'Account creation is not available yet. Please try again later.';

  async function sendCode() {
    if (!ready) throw new Error('Account creation is currently unavailable.');
    const input = verificationCodeInputSchema.parse({ email: email.trim() });
    const turnstileToken = verification.consume();
    try {
      const result = await portalApi<{ countdown: number }>('/auth/email/send-code', { method: 'POST', ...jsonBody({ ...input, ...(turnstileToken ? { turnstileToken } : {}) }) });
      setCodeSent(true); setResendRequested(false); setRemaining(result.countdown); setResendAt(Date.now() + result.countdown * 1000);
    } catch (error) {
      if (shouldRefreshAuthOptions(error)) void options.refetch();
      throw error;
    } finally { verification.reset(); }
  }
  async function resend() {
    if (requestPending.current || Date.now() < resendAt) return;
    if (options.data?.turnstile?.enabled && !resendRequested) {
      verification.reset(); setResendRequested(true); setMessage(''); return;
    }
    if (!verification.ready || !ready) { setMessage('Please complete verification before requesting another code.'); return; }
    requestPending.current = true;
    setMessage(''); setSubmitting(true);
    try { await sendCode(); setMessage('Another code has been requested. Check your inbox and spam folder.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The code could not be sent.'); }
    finally { requestPending.current = false; setSubmitting(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage('');
    if (requestPending.current) return;
    if (password !== confirmation) { setMessage('The passwords do not match.'); return; }
    if (!googleRegistrationSchema.safeParse({ password, invitationCode }).success) { setMessage('Use at least 8 characters and no more than 72 bytes for your password.'); return; }
    if (!google && !codeSent && !verification.ready) { setMessage('Please complete verification before requesting a code.'); return; }
    requestPending.current = true; setSubmitting(true);
    try {
      if (!ready) throw new Error('Account creation is currently unavailable.');
      if (google) {
        const result = await auth.completeGoogle({ password, invitationCode });
        setPassword(''); setConfirmation('');
        navigate(resolveConsoleReturnPath(result.next), { replace: true });
      } else if (!codeSent) {
        await sendCode();
      } else {
        const input = signupInputSchema.parse({ email, password, verifyCode, invitationCode });
        await auth.register(input);
        setPassword(''); setConfirmation('');
        navigate(next, { replace: true });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Your account could not be created.'); }
    finally { requestPending.current = false; setSubmitting(false); }
  }
  return <div className="auth-page">
    <div className="auth-orb auth-orb-one" /><div className="auth-orb auth-orb-two" />
    <button className="auth-theme" aria-label="Toggle color theme" onClick={toggle}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
    <main className="auth-panel">
      <a href={publicSiteHref('/')} aria-label="kineticRouter home" className="auth-brand"><Brand className="auth-wordmark" /></a>
      <section className="auth-card">
        <header><span className="auth-kicker">CUSTOMER CONSOLE</span><h1>{google ? 'Finish creating your account' : codeSent ? 'Verify your email' : 'Create an account'}</h1><p>{google ? 'Your Google email is verified. Choose a password to finish setting up your account.' : codeSent ? `Enter the 6-digit code sent to ${email.trim()}. Check your spam folder too.` : 'Get started with your kineticRouter account.'}</p></header>
        {!google && !codeSent && <><GoogleSignInButton next={next} onError={setMessage} /><div className="auth-divider"><span>or continue with email</span></div></>}
        {!google && <AuthSettingsNotice options={options.data} pending={options.isPending} failed={options.isError} retrying={options.isFetching} onRetry={() => { void options.refetch(); }} />}
        {ready ? <form onSubmit={submit} className="auth-form">
          {!codeSent && <>
            <label>Email address<input disabled={submitting} value={google ? pending.data?.email ?? '' : email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} readOnly={google} required autoFocus={!google} /></label>
            <label>Password<div className="password-field"><input disabled={submitting} value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={72} placeholder="At least 8 characters" required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            <label>Confirm password<input disabled={submitting} value={confirmation} onChange={event => setConfirmation(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={72} placeholder="Re-enter your password" required /></label>
            {invitationRequired && <label>Invitation code<input disabled={submitting} value={invitationCode} onChange={event => setInvitationCode(event.target.value)} maxLength={128} autoComplete="off" required /></label>}
          </>}
          {codeSent && <label>Verification code<input disabled={submitting} className="totp-input" value={verifyCode} onChange={event => setVerifyCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code" placeholder="000000" required autoFocus /></label>}
          {!google && !codeSent && options.data?.turnstile?.enabled && options.data.turnstile.siteKey && <Turnstile siteKey={options.data.turnstile.siteKey} theme={theme} resetKey={verification.resetKey} onTokenChange={verification.onTokenChange} />}
          {message && <div className="auth-message" role="status">{message}</div>}
          <Button className="auth-submit" disabled={submitting || (!google && !codeSent && !verification.ready)}>{submitting ? <LoaderCircle className="spin" size={17} /> : <>{google ? 'Create account' : codeSent ? 'Verify and create account' : 'Send verification code'}<ArrowRight size={17} /></>}</Button>
          {codeSent && <>
            {resendRequested && options.data?.turnstile?.enabled && options.data.turnstile.siteKey && <div className="auth-resend-verification"><p>Complete verification to request another email. You can still use your existing code above.</p><Turnstile siteKey={options.data.turnstile.siteKey} theme={theme} resetKey={verification.resetKey} onTokenChange={verification.onTokenChange} /></div>}
            <button className="auth-back" type="button" disabled={submitting || remaining > 0 || (resendRequested && !verification.ready)} onClick={() => void resend()}>{remaining > 0 ? `Resend code in ${remaining}s` : resendRequested ? 'Verify and resend code' : 'Resend code'}</button>
            {resendRequested && <button className="auth-back" type="button" disabled={submitting} onClick={() => { verification.reset(); setResendRequested(false); }}>Cancel resend</button>}
            <button className="auth-back" type="button" disabled={submitting} onClick={() => { verification.reset(); setResendRequested(false); setCodeSent(false); setVerifyCode(''); setMessage(''); }}>Change email or password</button>
          </>}
        </form> : <p className="auth-message" role="status">{checking ? 'Checking account availability…' : unavailable}</p>}
        {!ready && message && <div className="auth-message" role="status">{message}</div>}
        <p className="auth-switch"><Link className="auth-back" to={`/sign-in?next=${encodeURIComponent(next)}`}>{google ? 'Back to sign in' : 'Already have an account? Sign in'}</Link></p>
      </section>
      <p className="auth-legal">By continuing, you agree to the <a href={publicSiteHref('/terms-of-service')}>Terms of Service</a> and <a href={publicSiteHref('/privacy')}>Privacy Policy</a>.</p>
    </main>
  </div>;
}
