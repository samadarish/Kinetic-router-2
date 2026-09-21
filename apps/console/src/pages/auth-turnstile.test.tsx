// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuthOptions } from '@kineticrouter/portal-contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalApiError, portalApi } from '../lib/api';
import type { TurnstileRenderOptions } from '../lib/turnstile';
import { SignInPage } from './SignInPage';
import { SignUpPage } from './SignUpPage';

const mocks = vi.hoisted(() => ({
  auth: { loading: false, authenticated: false, login: vi.fn(), completeTotp: vi.fn(), register: vi.fn(), completeGoogle: vi.fn() },
  options: { data: undefined as AuthOptions | undefined, isPending: false, isError: false, isFetching: false, refetch: vi.fn() },
  theme: { theme: 'dark' as 'dark' | 'light', toggle: vi.fn() },
  navigate: vi.fn(),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../lib/theme', () => ({ useTheme: () => mocks.theme }));
vi.mock('../lib/onboarding', async original => ({
  ...await original<typeof import('../lib/onboarding')>(),
  useAuthOptions: () => mocks.options,
}));
vi.mock('../lib/api', async original => ({
  ...await original<typeof import('../lib/api')>(),
  portalApi: vi.fn(),
}));
vi.mock('react-router-dom', async original => ({
  ...await original<typeof import('react-router-dom')>(),
  useNavigate: () => mocks.navigate,
}));

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let widgets: TurnstileRenderOptions[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.auth.loading = false;
  mocks.auth.authenticated = false;
  mocks.auth.login.mockResolvedValue({ requires2fa: false });
  mocks.auth.completeTotp.mockResolvedValue({ requires2fa: false });
  mocks.auth.register.mockResolvedValue({ requires2fa: false });
  mocks.auth.completeGoogle.mockResolvedValue({ requires2fa: false, next: '/dashboard' });
  mocks.options.data = { emailSignup: true, googleSignin: false, invitationRequired: false, turnstile: { enabled: true, siteKey: 'test-site-key' } };
  mocks.options.isPending = false;
  mocks.options.isError = false;
  mocks.options.isFetching = false;
  mocks.options.refetch.mockResolvedValue({});
  mocks.theme.theme = 'dark';
  vi.mocked(portalApi).mockResolvedValue({ countdown: 60 });
  widgets = [];
  window.turnstile = {
    ready: callback => callback(),
    render: vi.fn((_container, options) => { widgets.push(options); return `widget-${widgets.length}`; }),
    remove: vi.fn(),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  delete window.turnstile;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(page: 'login' | 'signup' | 'google' = 'login') {
  await act(async () => {
    root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/sign-in?next=%2Fusage']}>
      {page === 'login' ? <SignInPage /> : <SignUpPage google={page === 'google'} />}
    </MemoryRouter></QueryClientProvider>);
  });
}

function getInput(selector: string) {
  const element = host.querySelector<HTMLInputElement>(selector);
  if (!element) throw new Error(`Missing input: ${selector}`);
  return element;
}

async function fill(selector: string, value: string) {
  const element = getInput(selector);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function credentials(signup = false) {
  await fill('input[type="email"]', 'person@example.com');
  await fill('input[autocomplete="' + (signup ? 'new-password' : 'current-password') + '"]', 'test-password');
  if (signup) await fill('input[placeholder="Re-enter your password"]', 'test-password');
}

function button(label: string) {
  const element = [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label);
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
}

function submitButton() { return host.querySelector<HTMLButtonElement>('button.auth-submit')!; }

async function click(label: string) { await act(async () => button(label).click()); }

async function prove(token = 'fresh-proof') {
  await act(async () => widgets.at(-1)!.callback(token));
}

async function submit(count = 1) {
  await act(async () => {
    for (let index = 0; index < count; index++) host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

describe('password sign-in with Turnstile', () => {
  it('requires a proof and forwards it once even when the form submits twice before React updates', async () => {
    const request = deferred<{ requires2fa: false }>();
    mocks.auth.login.mockReturnValue(request.promise);
    await render(); await credentials();
    expect(submitButton().disabled).toBe(true);
    await submit();
    expect(mocks.auth.login).not.toHaveBeenCalled();
    await prove('login-proof'); await submit(2);
    expect(mocks.auth.login).toHaveBeenCalledExactlyOnceWith('person@example.com', 'test-password', 'login-proof');
    expect(submitButton().disabled).toBe(true);
    await act(async () => request.resolve({ requires2fa: false }));
    expect(mocks.navigate).toHaveBeenCalledWith('/usage', { replace: true });
  });

  it('preserves credentials after failure, refreshes rejected settings, and requires a fresh proof', async () => {
    mocks.auth.login.mockRejectedValueOnce(new PortalApiError({ status: 400, code: 'TURNSTILE_FAILED', message: 'Verification failed.' }));
    await render(); await credentials(); await prove('first-proof');
    const consumedWidget = widgets.at(-1)!;
    await submit();
    expect(host.textContent).toContain('Verification failed.');
    expect(getInput('input[type="email"]').value).toBe('person@example.com');
    expect(getInput('input[type="password"]').value).toBe('test-password');
    expect(mocks.options.refetch).toHaveBeenCalledOnce();
    expect(submitButton().disabled).toBe(true);
    await act(async () => consumedWidget.callback('late-consumed-proof'));
    await submit();
    expect(mocks.auth.login).toHaveBeenCalledTimes(1);
    await prove('replacement-proof'); await submit();
    expect(mocks.auth.login).toHaveBeenLastCalledWith('person@example.com', 'test-password', 'replacement-proof');
  });

  it('completes TOTP without a second widget or proof and requires a fresh proof after going back', async () => {
    mocks.auth.login.mockResolvedValue({ requires2fa: true, tempToken: 'totp-transaction', maskedEmail: 'p***@example.com' });
    mocks.auth.completeTotp.mockRejectedValueOnce(new Error('Incorrect authenticator code.'));
    await render(); await credentials(); await prove(); await submit();
    expect(host.textContent).toContain('Two-step verification');
    expect(host.querySelector('.turnstile-verification')).toBeNull();
    const renderedWidgets = widgets.length;
    await fill('input[autocomplete="one-time-code"]', '123456'); await submit();
    expect(mocks.auth.completeTotp).toHaveBeenCalledExactlyOnceWith('totp-transaction', '123456');
    expect(widgets).toHaveLength(renderedWidgets);
    expect(submitButton().disabled).toBe(false);
    await click('Back to password sign in');
    expect(host.querySelector('.turnstile-verification')).not.toBeNull();
    expect(submitButton().disabled).toBe(true);
    expect(getInput('input[type="email"]').value).toBe('person@example.com');
  });

  it('invalidates a proof when the widget expires or its configuration changes', async () => {
    await render(); await credentials(); await prove();
    await act(async () => widgets.at(-1)!['expired-callback']());
    expect(submitButton().disabled).toBe(true);
    await click('Retry verification'); await prove('before-theme-change');
    mocks.theme.theme = 'light'; await render();
    expect(submitButton().disabled).toBe(true);
    expect(widgets.at(-1)!.theme).toBe('light');
    await prove('before-key-change');
    mocks.options.data!.turnstile.siteKey = 'changed-site-key'; await render();
    expect(submitButton().disabled).toBe(true);
    expect(widgets.at(-1)!.sitekey).toBe('changed-site-key');
    await submit();
    expect(mocks.auth.login).not.toHaveBeenCalled();
  });

  it('rejects an expired in-memory proof even if the browser did not deliver the widget callback', async () => {
    vi.useFakeTimers();
    await render(); await credentials(); await prove();
    vi.setSystemTime(Date.now() + 300_000);
    await submit();
    expect(mocks.auth.login).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Please complete the verification again.');
    expect(submitButton().disabled).toBe(true);
  });

  it('signs in normally without a widget when Turnstile is disabled', async () => {
    mocks.options.data!.turnstile = { enabled: false, siteKey: null };
    await render(); await credentials();
    expect(submitButton().disabled).toBe(false);
    expect(widgets).toHaveLength(0);
    await submit();
    expect(mocks.auth.login).toHaveBeenCalledExactlyOnceWith('person@example.com', 'test-password', undefined);
  });

  it.each(['loading', 'error', 'missing-key'] as const)('blocks password submission while settings are %s', async state => {
    if (state === 'loading') { mocks.options.data = undefined; mocks.options.isPending = true; }
    if (state === 'error') mocks.options.isError = true;
    if (state === 'missing-key') mocks.options.data!.turnstile.siteKey = null;
    await render(); await credentials(); await submit();
    expect(submitButton().disabled).toBe(true);
    expect(mocks.auth.login).not.toHaveBeenCalled();
    expect(widgets).toHaveLength(0);
    if (state === 'loading') expect(host.textContent).toContain('Loading sign-in options');
    else {
      await click('Retry verification settings');
      expect(mocks.options.refetch).toHaveBeenCalledOnce();
    }
  });
});

describe('email signup with Turnstile', () => {
  it('locks the email and password inputs while a verification email is being sent', async () => {
    const request = deferred<{ countdown: number }>();
    vi.mocked(portalApi).mockReturnValue(request.promise);
    await render('signup'); await credentials(true); await prove('pending-email-proof'); await submit();
    for (const selector of ['input[type="email"]', 'input[autocomplete="new-password"]', 'input[placeholder="Re-enter your password"]']) {
      expect(getInput(selector).disabled).toBe(true);
    }
    expect(submitButton().disabled).toBe(true);
    await submit();
    expect(portalApi).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(portalApi).mock.calls[0]![1]!.body))).toEqual({ email: 'person@example.com', turnstileToken: 'pending-email-proof' });
    await act(async () => request.resolve({ countdown: 60 }));
    expect(host.textContent).toContain('Enter the 6-digit code sent to person@example.com.');
    expect(getInput('input[autocomplete="one-time-code"]').disabled).toBe(false);
  });

  it('sends one protected email request and registers with the email code without reusing a proof', async () => {
    const request = deferred<{ countdown: number }>();
    vi.mocked(portalApi).mockReturnValue(request.promise);
    await render('signup'); await credentials(true);
    expect(submitButton().disabled).toBe(true);
    await prove('email-proof'); await submit(2);
    expect(portalApi).toHaveBeenCalledTimes(1);
    const [path, init] = vi.mocked(portalApi).mock.calls[0]!;
    expect(path).toBe('/auth/email/send-code');
    expect(JSON.parse(String(init!.body))).toEqual({ email: 'person@example.com', turnstileToken: 'email-proof' });
    await act(async () => request.resolve({ countdown: 60 }));
    expect(host.textContent).toContain('Verify your email');
    expect(host.querySelector('.turnstile-verification')).toBeNull();
    expect(submitButton().disabled).toBe(false);
    await fill('input[autocomplete="one-time-code"]', '123456'); await submit();
    expect(mocks.auth.register).toHaveBeenCalledOnce();
    const registration = mocks.auth.register.mock.calls[0]![0];
    expect(registration).toMatchObject({ email: 'person@example.com', password: 'test-password', verifyCode: '123456' });
    expect(registration).not.toHaveProperty('turnstileToken');
    expect(registration).not.toHaveProperty('turnstile_token');
    expect(portalApi).toHaveBeenCalledTimes(1);
  });

  it('keeps signup values and requires a new proof after email delivery request failure', async () => {
    vi.mocked(portalApi).mockRejectedValueOnce(new PortalApiError({ status: 400, code: 'CAPTCHA_INVALID', message: 'Verification was rejected.' }));
    await render('signup'); await credentials(true); await prove('rejected-email-proof'); await submit();
    expect(host.textContent).toContain('Verification was rejected.');
    expect(getInput('input[type="email"]').value).toBe('person@example.com');
    expect(getInput('input[placeholder="Re-enter your password"]').value).toBe('test-password');
    expect(submitButton().disabled).toBe(true);
    expect(mocks.options.refetch).toHaveBeenCalledOnce();
    await submit();
    expect(portalApi).toHaveBeenCalledTimes(1);
    await prove('new-email-proof'); await submit();
    expect(portalApi).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(portalApi).mock.calls[1]![1]!.body))).toMatchObject({ turnstileToken: 'new-email-proof' });
  });

  it('waits for cooldown, opens a fresh resend widget, and sends only after explicit confirmation', async () => {
    vi.useFakeTimers();
    await render('signup'); await credentials(true); await prove('first-email-proof'); await submit();
    expect(button('Resend code in 60s').disabled).toBe(true);
    await click('Resend code in 60s');
    expect(portalApi).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(60_000));
    await click('Resend code');
    expect(host.querySelector('.turnstile-verification')).not.toBeNull();
    expect(button('Verify and resend code').disabled).toBe(true);
    expect(submitButton().disabled).toBe(false);
    expect(portalApi).toHaveBeenCalledTimes(1);
    await prove('resend-proof');
    expect(portalApi).toHaveBeenCalledTimes(1);
    await click('Verify and resend code');
    expect(portalApi).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(portalApi).mock.calls[1]![1]!.body))).toEqual({ email: 'person@example.com', turnstileToken: 'resend-proof' });
    expect(host.querySelector('.turnstile-verification')).toBeNull();
    expect(button('Resend code in 60s').disabled).toBe(true);
  });

  it('allows an existing email code to register while the fresh resend widget is still pending', async () => {
    vi.useFakeTimers();
    await render('signup'); await credentials(true); await prove(); await submit();
    await act(async () => vi.advanceTimersByTime(60_000));
    await click('Resend code');
    mocks.auth.register.mockRejectedValueOnce(new Error('Incorrect verification code.'));
    await fill('input[autocomplete="one-time-code"]', '000000'); await submit();
    expect(host.textContent).toContain('Incorrect verification code.');
    expect(button('Verify and resend code').disabled).toBe(true);
    expect(submitButton().disabled).toBe(false);
    await fill('input[autocomplete="one-time-code"]', '123456'); await submit();
    expect(mocks.auth.register).toHaveBeenCalledTimes(2);
    expect(mocks.auth.register.mock.calls[1]![0]).not.toHaveProperty('turnstileToken');
    expect(portalApi).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith('/usage', { replace: true });
  });

  it('keeps the existing signup flow when Turnstile is disabled', async () => {
    mocks.options.data!.turnstile = { enabled: false, siteKey: null };
    await render('signup'); await credentials(true); await submit();
    expect(widgets).toHaveLength(0);
    expect(JSON.parse(String(vi.mocked(portalApi).mock.calls[0]![1]!.body))).toEqual({ email: 'person@example.com' });
    expect(host.textContent).toContain('Verify your email');
  });

  it('completes Google registration without a Turnstile proof even when password Turnstile is enabled', async () => {
    mocks.options.data!.googleSignin = true;
    const pending = { email: 'google@example.com', invitationRequired: false };
    client.setQueryData(['google-registration'], pending);
    vi.mocked(portalApi).mockResolvedValue(pending);
    await render('google');
    expect(getInput('input[type="email"]').readOnly).toBe(true);
    expect(getInput('input[type="email"]').value).toBe('google@example.com');
    await fill('input[autocomplete="new-password"]', 'test-password');
    await fill('input[placeholder="Re-enter your password"]', 'test-password');
    expect(submitButton().disabled).toBe(false);
    expect(widgets).toHaveLength(0);
    await submit();
    expect(mocks.auth.completeGoogle).toHaveBeenCalledExactlyOnceWith({ password: 'test-password', invitationCode: '' });
    expect(mocks.auth.register).not.toHaveBeenCalled();
    expect(vi.mocked(portalApi).mock.calls.every(([path]) => path === '/auth/google/registration')).toBe(true);
  });

  it.each(['loading', 'error', 'missing-key'] as const)('blocks requesting signup email while settings are %s', async state => {
    if (state === 'loading') { mocks.options.data = undefined; mocks.options.isPending = true; }
    if (state === 'error') mocks.options.isError = true;
    if (state === 'missing-key') mocks.options.data!.turnstile.siteKey = null;
    await render('signup');
    if (host.querySelector('form')) {
      await credentials(true); await submit();
      expect(submitButton().disabled).toBe(true);
    }
    expect(portalApi).not.toHaveBeenCalled();
    expect(mocks.auth.register).not.toHaveBeenCalled();
    expect(widgets).toHaveLength(0);
  });
});
