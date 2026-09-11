import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LoaderCircle, Moon, Sun } from 'lucide-react';
import { signupInputSchema, googleRegistrationSchema, type GoogleRegistrationView } from '@kineticrouter/portal-contract';
import { resolveConsoleReturnPath } from '@kineticrouter/platform-config/routes';
import { Brand } from '../components/Brand';
import { Button } from '../components/Ui';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { jsonBody, portalApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAuthOptions } from '../lib/onboarding';
import { publicSiteHref } from '../lib/public-site';
import { useTheme } from '../lib/theme';

export function SignUpPage({ google = false }: { google?: boolean }) {
  const auth = useAuth();
  const options = useAuthOptions();
  const { theme, toggle } = useTheme();
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
  const ready = google ? Boolean(pending.data && options.data?.googleSignin) : options.data?.emailSignup === true;
  const checking = options.isPending || (google && pending.isPending);
  const invitationRequired = google ? pending.data?.invitationRequired : options.data?.invitationRequired;
  const unavailable = pending.error instanceof Error ? pending.error.message : 'Account creation is not available yet. Please try again later.';

  async function sendCode() {
    const result = await portalApi<{ countdown: number }>('/auth/email/send-code', { method: 'POST', ...jsonBody({ email: email.trim() }) });
    setCodeSent(true); setResendAt(Date.now() + result.countdown * 1000);
  }
  async function resend() {
    setMessage(''); setSubmitting(true);
    try { await sendCode(); setMessage('Another code has been requested. Check your inbox and spam folder.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The code could not be sent.'); }
    finally { setSubmitting(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage('');
    if (password !== confirmation) { setMessage('The passwords do not match.'); return; }
    if (!googleRegistrationSchema.safeParse({ password, invitationCode }).success) { setMessage('Use at least 8 characters and no more than 72 bytes for your password.'); return; }
    setSubmitting(true);
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
    finally { setSubmitting(false); }
  }
  return <div className="auth-page">
    <div className="auth-orb auth-orb-one" /><div className="auth-orb auth-orb-two" />
    <button className="auth-theme" aria-label="Toggle color theme" onClick={toggle}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
    <main className="auth-panel">
      <a href={publicSiteHref('/')} aria-label="kineticRouter home" className="auth-brand"><Brand className="auth-wordmark" /></a>
      <section className="auth-card">
        <header><span className="auth-kicker">CUSTOMER CONSOLE</span><h1>{google ? 'Finish creating your account' : codeSent ? 'Verify your email' : 'Create an account'}</h1><p>{google ? 'Your Google email is verified. Choose a password to finish setting up your account.' : codeSent ? `Enter the 6-digit code sent to ${email.trim()}. Check your spam folder too.` : 'Get started with your kineticRouter account.'}</p></header>
        {!google && !codeSent && <><GoogleSignInButton next={next} onError={setMessage} /><div className="auth-divider"><span>or continue with email</span></div></>}
        {ready ? <form onSubmit={submit} className="auth-form">
          {!codeSent && <>
            <label>Email address<input value={google ? pending.data?.email ?? '' : email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} readOnly={google} required autoFocus={!google} /></label>
            <label>Password<div className="password-field"><input value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={72} placeholder="At least 8 characters" required /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            <label>Confirm password<input value={confirmation} onChange={event => setConfirmation(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={72} placeholder="Re-enter your password" required /></label>
            {invitationRequired && <label>Invitation code<input value={invitationCode} onChange={event => setInvitationCode(event.target.value)} maxLength={128} autoComplete="off" required /></label>}
          </>}
          {codeSent && <label>Verification code<input className="totp-input" value={verifyCode} onChange={event => setVerifyCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code" placeholder="000000" required autoFocus /></label>}
          {message && <div className="auth-message" role="status">{message}</div>}
          <Button className="auth-submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={17} /> : <>{google ? 'Create account' : codeSent ? 'Verify and create account' : 'Send verification code'}<ArrowRight size={17} /></>}</Button>
          {codeSent && <><button className="auth-back" type="button" disabled={submitting || remaining > 0} onClick={() => void resend()}>{remaining > 0 ? `Resend code in ${remaining}s` : 'Resend code'}</button><button className="auth-back" type="button" disabled={submitting} onClick={() => { setCodeSent(false); setVerifyCode(''); setMessage(''); }}>Change email or password</button></>}
        </form> : <p className="auth-message" role="status">{checking ? 'Checking account availability…' : unavailable}</p>}
        {!ready && message && <div className="auth-message" role="status">{message}</div>}
        <p className="auth-switch"><Link className="auth-back" to={`/sign-in?next=${encodeURIComponent(next)}`}>{google ? 'Back to sign in' : 'Already have an account? Sign in'}</Link></p>
      </section>
      <p className="auth-legal">By continuing, you agree to the <a href={publicSiteHref('/terms-of-service')}>Terms of Service</a> and <a href={publicSiteHref('/privacy')}>Privacy Policy</a>.</p>
    </main>
  </div>;
}
