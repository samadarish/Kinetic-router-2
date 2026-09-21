export interface TurnstileRenderOptions {
  sitekey: string;
  theme: 'light' | 'dark';
  size: 'compact' | 'flexible';
  appearance: 'always';
  'response-field': false;
  retry: 'never';
  'refresh-expired': 'never';
  'refresh-timeout': 'never';
  callback: (token: string) => void;
  'error-callback': (code: string) => void;
  'expired-callback': () => void;
  'timeout-callback': () => void;
  'unsupported-callback': () => void;
}

export interface TurnstileApi {
  ready?: (callback: () => void) => void;
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const scriptUrl = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let pendingLoad: Promise<TurnstileApi> | null = null;

/** Share the official script across mounted widgets and StrictMode effect replays. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (pendingLoad) return pendingLoad;

  const promise = new Promise<TurnstileApi>((resolve, reject) => {
    let settled = false;
    let script: HTMLScriptElement | null = null;
    const timeout = window.setTimeout(() => fail(), 15_000);

    function cleanup() {
      window.clearTimeout(timeout);
      script?.removeEventListener('load', loaded);
      script?.removeEventListener('error', fail);
    }

    function fail() {
      if (settled) return;
      settled = true;
      cleanup();
      script?.remove();
      reject(new Error('Verification could not load. Check your connection and try again.'));
    }

    function loaded() {
      if (settled) return;
      const api = window.turnstile;
      if (!api || typeof api.render !== 'function' || typeof api.remove !== 'function') { fail(); return; }
      // The script's load event runs after evaluation. Turnstile.ready() cannot
      // be used with an async/defer script, so use the now-loaded API directly.
      settled = true;
      cleanup();
      resolve(api);
    }

    if (window.turnstile) {
      loaded();
      return;
    }

    script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.defer = true;
    script.dataset.turnstileLoader = 'true';
    script.addEventListener('load', loaded);
    script.addEventListener('error', fail);
    document.head.appendChild(script);
  });

  pendingLoad = promise;
  // Keep only an in-flight promise: failed loads can be retried, and a loaded API
  // is reused directly on future mounts without adding another script element.
  void promise.then(
    () => { if (pendingLoad === promise) pendingLoad = null; },
    () => { if (pendingLoad === promise) pendingLoad = null; },
  );
  return promise;
}
