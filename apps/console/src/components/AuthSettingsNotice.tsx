import type { AuthOptions } from '@kineticrouter/portal-contract';

export function AuthSettingsNotice({ options, pending, failed, retrying, onRetry }: {
  options?: AuthOptions; pending: boolean; failed: boolean; retrying: boolean; onRetry: () => void;
}) {
  if (pending) return <div className="auth-message" role="status">Loading sign-in options…</div>;
  if (failed || !options?.turnstile || (options.turnstile.enabled && !options.turnstile.siteKey)) {
    return <div className="auth-settings-error"><div className="auth-message" role="status">Verification is temporarily unavailable. Please try again.</div><button className="auth-back" type="button" disabled={retrying} onClick={onRetry}>{retrying ? 'Retrying…' : 'Retry verification settings'}</button></div>;
  }
  return null;
}
