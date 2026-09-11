import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { jsonBody, portalApi } from '../lib/api';
import { useAuthOptions } from '../lib/onboarding';

export function GoogleSignInButton({ next, onError }: { next: string; onError: (message: string) => void }) {
  const options = useAuthOptions();
  const [busy, setBusy] = useState(false);
  const enabled = options.data?.googleSignin === true;
  async function start() {
    if (!enabled || busy) return;
    setBusy(true); onError('');
    try {
      const result = await portalApi<{ authorizeUrl: string }>('/auth/google/start', { method: 'POST', ...jsonBody({ next }) });
      const url = new URL(result.authorizeUrl);
      if (url.origin !== 'https://accounts.google.com') throw new Error('Google sign-in is temporarily unavailable.');
      window.location.assign(url.toString());
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Google sign-in could not be started.'); setBusy(false);
    }
  }
  return <button type="button" className={`google-button${enabled ? ' google-button-ready' : ''}`} disabled={!enabled || busy} onClick={() => void start()}>
    {busy ? <LoaderCircle className="spin" size={18} /> : <svg className="google-mark" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {/* Google Identity's official sign-in artwork: https://developers.google.com/identity/branding-guidelines */}
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>}
    Continue with Google {!enabled && <span className="google-status">{options.isPending ? 'Loading' : 'Coming soon'}</span>}
  </button>;
}
