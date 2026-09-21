import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadTurnstile, type TurnstileApi } from '../lib/turnstile';

export interface TurnstileProps {
  siteKey: string;
  theme: 'light' | 'dark';
  resetKey: number;
  onTokenChange: (token: string | null) => void;
}

type Status = 'loading' | 'ready' | 'verified' | 'expired' | 'error';

export function Turnstile({ siteKey, theme, resetKey, onTokenChange }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [size, setSize] = useState<'compact' | 'flexible'>('flexible');

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Flexible widgets have a 300px minimum; compact widgets fit narrow forms.
    const updateSize = (width: number) => {
      if (width > 0) setSize(width < 300 ? 'compact' : 'flexible');
    };
    const measure = () => updateSize(container.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(entries => {
        const width = entries[0]?.contentRect.width;
        if (width !== undefined) updateSize(width);
      });
      observer.observe(container);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => { onTokenChangeRef.current = onTokenChange; }, [onTokenChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let active = true;
    let acceptsToken = true;
    let api: TurnstileApi | undefined;
    let widgetId: string | undefined;
    onTokenChangeRef.current(null);
    setStatus('loading');

    function invalidate(next: 'error' | 'expired') {
      if (!active) return;
      acceptsToken = false;
      onTokenChangeRef.current(null);
      setStatus(next);
    }

    void loadTurnstile().then((loadedApi) => {
      if (!active) return;
      api = loadedApi;
      setStatus('ready');
      widgetId = api.render(container, {
        sitekey: siteKey,
        theme,
        size,
        appearance: 'always',
        'response-field': false,
        retry: 'never',
        'refresh-expired': 'never',
        'refresh-timeout': 'never',
        callback: (token) => {
          if (!active || !acceptsToken) return;
          if (!token) { invalidate('error'); return; }
          onTokenChangeRef.current(token);
          setStatus('verified');
        },
        'error-callback': () => invalidate('error'),
        'expired-callback': () => invalidate('expired'),
        'timeout-callback': () => invalidate('expired'),
        'unsupported-callback': () => invalidate('error'),
      });
      if (widgetId === undefined) invalidate('error');
    }).catch(() => invalidate('error'));

    return () => {
      active = false;
      onTokenChangeRef.current(null);
      if (api && widgetId !== undefined) {
        try { api.remove(widgetId); } catch { /* The widget may already have been removed by Cloudflare. */ }
      }
      container.replaceChildren();
    };
  }, [siteKey, theme, resetKey, retryKey, size]);

  const needsRetry = status === 'error' || status === 'expired';
  const message = status === 'loading' ? 'Loading verification…'
    : status === 'error' ? 'Verification could not be completed. Check your connection and try again.'
      : status === 'expired' ? 'Verification expired. Please try again.'
        : status === 'verified' ? 'Verification complete.' : 'Complete the verification to continue.';

  return <div className="turnstile-verification">
    <div className="turnstile-container" ref={containerRef} />
    <div className="turnstile-status" role="status" aria-live="polite">{message}</div>
    {needsRetry && <button type="button" className="auth-back" onClick={() => setRetryKey((value) => value + 1)}>Retry verification</button>}
  </div>;
}
