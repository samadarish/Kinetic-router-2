// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Turnstile, type TurnstileProps } from './Turnstile';
import type { TurnstileApi, TurnstileRenderOptions } from '../lib/turnstile';

let host: HTMLDivElement;
let root: Root;
let mounted: boolean;

function makeApi() {
  const configurations: TurnstileRenderOptions[] = [];
  const api: TurnstileApi = {
    ready: vi.fn((callback) => callback()),
    render: vi.fn((_container, options) => {
      configurations.push(options);
      return `widget-${configurations.length}`;
    }),
    remove: vi.fn(),
  };
  return { api, configurations };
}

function script() {
  return document.querySelector<HTMLScriptElement>('script[data-turnstile-loader]');
}

async function render(props: Partial<TurnstileProps> = {}, strict = false) {
  const element = <Turnstile siteKey="public-key" theme="dark" resetKey={0} onTokenChange={vi.fn()} {...props} />;
  await act(async () => { root.render(strict ? <StrictMode>{element}</StrictMode> : element); });
}

async function clickRetry() {
  const retry = host.querySelector<HTMLButtonElement>('button');
  expect(retry?.textContent).toBe('Retry verification');
  await act(async () => retry?.click());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mounted = true;
  delete window.turnstile;
});

afterEach(async () => {
  await act(async () => {
    if (mounted) root.unmount();
    script()?.dispatchEvent(new Event('error'));
  });
  host.remove();
  document.querySelectorAll('script[data-turnstile-loader]').forEach((element) => element.remove());
  delete window.turnstile;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Turnstile', () => {
  it('loads one official script and renders one widget through StrictMode effect replays', async () => {
    const { api, configurations } = makeApi();
    api.ready = vi.fn(() => { throw new Error('Remove async/defer before using turnstile.ready().'); });
    const onTokenChange = vi.fn();
    await render({ onTokenChange }, true);
    expect(document.querySelectorAll('script[data-turnstile-loader]')).toHaveLength(1);
    expect(script()?.src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    expect(host.textContent).toContain('Loading verification');

    await act(async () => {
      window.turnstile = api;
      script()?.dispatchEvent(new Event('load'));
    });
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.ready).not.toHaveBeenCalled();
    expect(configurations[0]).toMatchObject({
      sitekey: 'public-key', theme: 'dark', size: 'flexible', 'response-field': false,
    });
    await act(async () => configurations[0]!.callback('proof'));
    expect(onTokenChange).toHaveBeenLastCalledWith('proof');
    expect(host.textContent).toContain('Verification complete.');
    expect(host.querySelector('input')).toBeNull();
  });

  it('shares a pending script across multiple widgets and cleans each instance independently', async () => {
    const { api } = makeApi();
    await act(async () => root.render(<>
      <Turnstile siteKey="first" theme="light" resetKey={0} onTokenChange={vi.fn()} />
      <Turnstile siteKey="second" theme="dark" resetKey={0} onTokenChange={vi.fn()} />
    </>));
    expect(document.querySelectorAll('script[data-turnstile-loader]')).toHaveLength(1);
    await act(async () => {
      window.turnstile = api;
      script()?.dispatchEvent(new Event('load'));
    });
    expect(api.render).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
    mounted = false;
    expect(api.remove).toHaveBeenCalledWith('widget-1');
    expect(api.remove).toHaveBeenCalledWith('widget-2');
  });

  it('does not render after unmount while the shared script is still loading', async () => {
    const { api } = makeApi();
    const onTokenChange = vi.fn();
    await render({ onTokenChange });
    await act(async () => root.unmount());
    mounted = false;
    const callsAtUnmount = onTokenChange.mock.calls.length;
    await act(async () => {
      window.turnstile = api;
      script()?.dispatchEvent(new Event('load'));
    });
    expect(api.render).not.toHaveBeenCalled();
    expect(onTokenChange).toHaveBeenCalledTimes(callsAtUnmount);
  });

  it('reuses an already loaded API without calling ready or adding another script', async () => {
    const { api } = makeApi();
    api.ready = vi.fn(() => { throw new Error('Remove async/defer before using turnstile.ready().'); });
    window.turnstile = api;
    await render();
    expect(api.ready).not.toHaveBeenCalled();
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(script()).toBeNull();
  });

  it('rejects a loaded script without a complete widget API', async () => {
    await render();
    await act(async () => {
      window.turnstile = { render: vi.fn() } as unknown as TurnstileApi;
      script()?.dispatchEvent(new Event('load'));
    });
    expect(host.textContent).toContain('Verification could not be completed');
    expect(script()).toBeNull();
  });

  it('retries a failed script load without retaining the failed script', async () => {
    const { api } = makeApi();
    await render();
    const failedScript = script();
    await act(async () => failedScript?.dispatchEvent(new Event('error')));
    expect(script()).toBeNull();
    expect(host.textContent).toContain('Verification could not be completed');
    await clickRetry();
    expect(script()).not.toBe(failedScript);
    expect(document.querySelectorAll('script[data-turnstile-loader]')).toHaveLength(1);
    await act(async () => {
      window.turnstile = api;
      // A late event from the removed script must not resolve the current load.
      failedScript?.dispatchEvent(new Event('load'));
    });
    expect(api.render).not.toHaveBeenCalled();
    await act(async () => script()?.dispatchEvent(new Event('load')));
    expect(api.render).toHaveBeenCalledTimes(1);
  });

  it('offers retry when the script never loads', async () => {
    vi.useFakeTimers();
    await render();
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(host.textContent).toContain('Verification could not be completed');
    expect(script()).toBeNull();
    await clickRetry();
    expect(script()).not.toBeNull();
  });

  it.each(['expired-callback', 'timeout-callback', 'error-callback', 'unsupported-callback'] as const)(
    'clears proof on %s and obtains a new proof only after retry', async (callback) => {
      const { api, configurations } = makeApi();
      window.turnstile = api;
      const onTokenChange = vi.fn();
      await render({ onTokenChange });
      await act(async () => configurations[0]!.callback('first-proof'));
      expect(onTokenChange).toHaveBeenLastCalledWith('first-proof');
      await act(async () => configurations[0]![callback]('network-error'));
      expect(onTokenChange).toHaveBeenLastCalledWith(null);
      await act(async () => configurations[0]!.callback('late-proof'));
      expect(onTokenChange).toHaveBeenLastCalledWith(null);
      await clickRetry();
      expect(api.remove).toHaveBeenCalledWith('widget-1');
      expect(api.render).toHaveBeenCalledTimes(2);
      await act(async () => configurations[1]!.callback('fresh-proof'));
      expect(onTokenChange).toHaveBeenLastCalledWith('fresh-proof');
    },
  );

  it.each([
    { resetKey: 1 },
    { siteKey: 'replacement-key' },
    { theme: 'light' as const },
  ])('invalidates proof and old callbacks when configuration changes: %j', async (change) => {
    const { api, configurations } = makeApi();
    window.turnstile = api;
    const onTokenChange = vi.fn();
    await render({ onTokenChange });
    await act(async () => configurations[0]!.callback('old-proof'));
    await render({ onTokenChange, ...change });
    expect(onTokenChange).toHaveBeenLastCalledWith(null);
    expect(api.remove).toHaveBeenCalledWith('widget-1');
    expect(api.render).toHaveBeenCalledTimes(2);
    await act(async () => configurations[1]!.callback('new-proof'));
    await act(async () => {
      configurations[0]!.callback('stale-proof');
      configurations[0]!['expired-callback']();
    });
    expect(onTokenChange).toHaveBeenLastCalledWith('new-proof');
  });

  it('uses the current callback without resetting when only callback identity changes', async () => {
    const { api, configurations } = makeApi();
    window.turnstile = api;
    const firstCallback = vi.fn();
    const latestCallback = vi.fn();
    await render({ onTokenChange: firstCallback });
    await render({ onTokenChange: latestCallback });
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.remove).not.toHaveBeenCalled();
    await act(async () => configurations[0]!.callback('proof'));
    expect(latestCallback).toHaveBeenLastCalledWith('proof');
    expect(firstCallback).not.toHaveBeenCalledWith('proof');
  });

  it('invalidates the proof at unmount and ignores subsequent widget callbacks', async () => {
    const { api, configurations } = makeApi();
    window.turnstile = api;
    const onTokenChange = vi.fn();
    await render({ onTokenChange });
    await act(async () => configurations[0]!.callback('proof'));
    await act(async () => root.unmount());
    mounted = false;
    expect(api.remove).toHaveBeenCalledWith('widget-1');
    expect(onTokenChange).toHaveBeenLastCalledWith(null);
    const callsAtUnmount = onTokenChange.mock.calls.length;
    await act(async () => {
      configurations[0]!.callback('late-proof');
      configurations[0]!['error-callback']('late-error');
    });
    expect(onTokenChange).toHaveBeenCalledTimes(callsAtUnmount);
  });

  it('offers retry when the API throws while rendering', async () => {
    const { api } = makeApi();
    api.render = vi.fn(() => { throw new Error('bad configuration'); });
    window.turnstile = api;
    await render();
    expect(host.textContent).toContain('Verification could not be completed');
    expect(host.querySelector('button')?.textContent).toBe('Retry verification');
  });

  it('fits narrow forms and invalidates old proof when resizing changes widget size', async () => {
    const { api, configurations } = makeApi();
    window.turnstile = api;
    const onTokenChange = vi.fn();
    const disconnect = vi.fn();
    let resize: ((width: number) => void) | undefined;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 244 } as DOMRect);
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        resize = width => callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      observe = vi.fn();
      disconnect = disconnect;
    });

    await render({ onTokenChange });
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(configurations[0]?.size).toBe('compact');
    await act(async () => configurations[0]!.callback('compact-proof'));
    await act(async () => resize?.(299));
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(onTokenChange).toHaveBeenLastCalledWith('compact-proof');

    await act(async () => resize?.(300));
    expect(api.remove).toHaveBeenCalledWith('widget-1');
    expect(api.render).toHaveBeenCalledTimes(2);
    expect(configurations[1]?.size).toBe('flexible');
    expect(onTokenChange).toHaveBeenLastCalledWith(null);
    await act(async () => configurations[0]!.callback('stale-compact-proof'));
    expect(onTokenChange).toHaveBeenLastCalledWith(null);
    await act(async () => configurations[1]!.callback('flexible-proof'));
    await act(async () => resize?.(400));
    expect(api.render).toHaveBeenCalledTimes(2);
    expect(onTokenChange).toHaveBeenLastCalledWith('flexible-proof');

    await act(async () => resize?.(244));
    expect(api.remove).toHaveBeenCalledWith('widget-2');
    expect(configurations[2]?.size).toBe('compact');
    expect(onTokenChange).toHaveBeenLastCalledWith(null);
    await act(async () => root.unmount());
    mounted = false;
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
