import { useCallback, useRef, useState } from 'react';
import type { AuthOptions } from '@kineticrouter/portal-contract';

// A proof belongs to one widget configuration and one protected request.
export function useTurnstileProof(config: AuthOptions['turnstile'] | undefined, theme: string) {
  const key = config?.enabled ? `${config.siteKey ?? ''}:${theme}` : '';
  const proof = useRef<{ token: string; key: string; createdAt: number } | null>(null);
  const [available, setAvailable] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const onTokenChange = useCallback((token: string | null) => {
    proof.current = token ? { token, key, createdAt: Date.now() } : null;
    setAvailable(token ? key : null);
  }, [key]);
  const reset = useCallback(() => {
    proof.current = null;
    setAvailable(null);
    setResetKey(value => value + 1);
  }, []);
  const ready = Boolean(config && (!config.enabled || (config.siteKey && available === key)));

  function consume() {
    if (!config || (config.enabled && !config.siteKey)) throw new Error('Verification is unavailable. Please try again.');
    if (!config.enabled) return undefined;
    const current = proof.current;
    proof.current = null;
    setAvailable(null);
    if (!current || current.key !== key || Date.now() - current.createdAt >= 300_000) {
      reset();
      throw new Error('Please complete the verification again.');
    }
    return current.token;
  }

  return { ready, resetKey, onTokenChange, consume, reset };
}
