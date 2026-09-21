import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginInputSchema, signupInputSchema, verificationCodeInputSchema } from '@kineticrouter/portal-contract';
import { Sub2ApiClient, Sub2ApiOnboardingClient } from '@kineticrouter/sub2api-client';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';

vi.mock('@hono/node-server/conninfo', () => ({ getConnInfo: () => ({ remote: { address: '127.0.0.1' } }) }));

const resources: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(resources.splice(0).flatMap(resource => [
    resource.store.close(), resource.authFlows.close(), resource.analytics.close(),
    resource.playgroundSettings.close(), resource.conversations.close(),
  ]));
});

const siteKey = '0x4AAAA-public-test-key';
const proof = 'single-use-browser-proof';
const credentials = { email: 'person@example.com', password: 'correct-password' };
const signup = { ...credentials, verifyCode: '012345' };
const nativeUser = { id: 42, email: credentials.email, username: 'Person', status: 'active', role: 'user', balance: 0, concurrency: 1 };
const tokens = { access_token: 'private-native-access', refresh_token: 'private-native-refresh', expires_in: 900, token_type: 'Bearer' };
const json = (data: unknown) => new Response(JSON.stringify({ code: 0, data }), { headers: { 'content-type': 'application/json' } });
const failure = (code: string, message: string, status = 400) => new Response(JSON.stringify({ code, message }), { status, headers: { 'content-type': 'application/json' } });

function setup(options: { settings?: Record<string, unknown>; settingsFail?: boolean; requires2fa?: boolean } = {}) {
  const settings = {
    registration_enabled: true, email_verify_enabled: true, google_oauth_enabled: true,
    turnstile_enabled: true, turnstile_site_key: siteKey,
    ...options.settings,
  };
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname.replace('/api/v1/', '');
    if (path === 'settings/public') return options.settingsFail ? failure('SETTINGS_UNAVAILABLE', 'Private settings unavailable.', 503) : json(settings);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    if (path === 'auth/login' || path === 'auth/send-verify-code') {
      // The native service, not the BFF, is the proof verifier.
      if (settings.turnstile_enabled === true && body.turnstile_token !== proof) {
        return failure('TURNSTILE_FAILED', 'Human verification failed. Please try again.');
      }
      if (path === 'auth/send-verify-code') return json({ countdown: 60 });
      return options.requires2fa
        ? json({ requires_2fa: true, temp_token: 'native-totp-challenge', user_email_masked: 'p***@example.com' })
        : json({ ...tokens, user: nativeUser });
    }
    if (path === 'auth/login/2fa' || path === 'auth/register') return json({ ...tokens, user: nativeUser });
    if (path === 'user/profile') return json(nativeUser);
    throw new Error(`Unexpected upstream request: ${path}`);
  });
  const resource = createApp(undefined, {
    client: new Sub2ApiClient('https://account.invalid/api/v1', fetcher),
    onboardingClient: new Sub2ApiOnboardingClient('https://account.invalid/api/v1', fetcher),
    authGates: { emailSignup: true, googleSignin: true }, analyticsEnabled: false,
  });
  resources.push(resource);
  const post = (path: string, body: unknown) => resource.app.request(`/portal/v1/auth/${path}`, {
    method: 'POST', headers: { origin: config.portalOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const upstreamBodies = (path: string) => fetcher.mock.calls
    .filter(([url]) => new URL(String(url)).pathname === `/api/v1/${path}`)
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
  return { ...resource, fetcher, post, upstreamBodies };
}

function sessionCookie(response: Response) {
  return response.headers.getSetCookie().find(value => value.startsWith(`${config.sessionCookieName}=`));
}

describe('Turnstile public configuration', () => {
  it('publishes only the enabled flag and site key while allowing supported email signup', async () => {
    const resource = setup({ settings: {
      turnstile_site_key: ` ${siteKey} `, turnstile_secret_key: 'private-turnstile-secret',
      smtp_password: 'private-mail-secret', unrelated: { secret: 'private-nested-secret' },
    } });
    const response = await resource.app.request('/portal/v1/auth/options');
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      emailSignup: true, googleSignin: true, invitationRequired: false,
      turnstile: { enabled: true, siteKey },
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('reports disabled Turnstile without exposing a stale site key', async () => {
    const resource = setup({ settings: { turnstile_enabled: false } });
    expect((await (await resource.app.request('/portal/v1/auth/options')).json()).data).toMatchObject({
      emailSignup: true, turnstile: { enabled: false, siteKey: null },
    });
  });

  it.each([undefined, null, '', '  ', 123, 'invalid key', 'x'.repeat(257)])('keeps enabled Turnstile fail-closed for invalid site key %j', async invalidKey => {
    const resource = setup({ settings: { turnstile_site_key: invalidKey } });
    expect((await (await resource.app.request('/portal/v1/auth/options')).json()).data).toEqual({
      emailSignup: false, googleSignin: true, invitationRequired: false,
      turnstile: { enabled: true, siteKey: null },
    });
    expect((await resource.post('email/send-code', { email: credentials.email, turnstileToken: proof })).status).toBe(503);
    expect(resource.upstreamBodies('auth/send-verify-code')).toEqual([]);
  });

  it.each([{ tencent_captcha_enabled: true }, { aliyun_captcha_enabled: true }])('retains unsupported CAPTCHA restrictions %j', async settings => {
    const resource = setup({ settings });
    expect((await (await resource.app.request('/portal/v1/auth/options')).json()).data).toMatchObject({
      emailSignup: false, googleSignin: false, turnstile: { enabled: true, siteKey },
    });
  });

  it('returns an error when settings cannot be read instead of reporting Turnstile disabled', async () => {
    const resource = setup({ settingsFail: true });
    const response = await resource.app.request('/portal/v1/auth/options');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'ACCOUNT_SERVICE_UNAVAILABLE' } });
  });
});

describe('Turnstile authentication relay', () => {
  it('forwards password login proof once while keeping native credentials server-side', async () => {
    const resource = setup();
    const response = await resource.post('password/login', { ...credentials, turnstileToken: proof });
    expect(response.status).toBe(200);
    expect(resource.upstreamBodies('auth/login')).toEqual([{ ...credentials, turnstile_token: proof }]);
    expect(sessionCookie(response)).toBeDefined();
    const body = await response.text();
    expect(body).not.toContain(proof);
    expect(body).not.toContain('private-native-');
  });

  it('forwards send-code proof without forwarding arbitrary browser fields', async () => {
    const resource = setup();
    const response = await resource.post('email/send-code', {
      email: credentials.email, turnstileToken: proof, turnstile_secret_key: 'browser-injected-secret', unexpected: true,
    });
    expect(response.status).toBe(200);
    expect(resource.upstreamBodies('auth/send-verify-code')).toEqual([{ email: credentials.email, turnstile_token: proof }]);
    expect((await response.json()).data).toEqual({ countdown: 60 });
  });

  it.each([
    ['password/login', credentials, 'auth/login'],
    ['email/send-code', { email: credentials.email }, 'auth/send-verify-code'],
  ] as const)('leaves missing and rejected proof verification to the native service for %s', async (path, body, upstreamPath) => {
    for (const turnstileToken of [undefined, 'invalid-proof']) {
      const resource = setup();
      const response = await resource.post(path, { ...body, ...(turnstileToken ? { turnstileToken } : {}) });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: 'TURNSTILE_FAILED' } });
      expect(sessionCookie(response)).toBeUndefined();
      expect(resource.upstreamBodies(upstreamPath)).toEqual([{ ...body, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) }]);
    }
  });

  it('keeps disabled password login and email verification token-free', async () => {
    const resource = setup({ settings: { turnstile_enabled: false } });
    expect((await resource.post('password/login', credentials)).status).toBe(200);
    expect((await resource.post('email/send-code', { email: credentials.email })).status).toBe(200);
    expect(resource.upstreamBodies('auth/login')).toEqual([credentials]);
    expect(resource.upstreamBodies('auth/send-verify-code')).toEqual([{ email: credentials.email }]);
  });

  it('completes verified-email registration without reusing the send-code proof', async () => {
    const resource = setup();
    expect((await resource.post('email/send-code', { email: credentials.email, turnstileToken: proof })).status).toBe(200);
    const response = await resource.post('email/register', { ...signup, turnstileToken: proof });
    expect(response.status).toBe(200);
    expect(resource.upstreamBodies('auth/register')).toEqual([{ ...credentials, verify_code: signup.verifyCode }]);
    expect(sessionCookie(response)).toBeDefined();
    expect(signupInputSchema.parse({ ...signup, turnstileToken: proof })).toEqual(signup);
  });

  it('preserves the separate TOTP step after a verified password login', async () => {
    const resource = setup({ requires2fa: true });
    const login = await resource.post('password/login', { ...credentials, turnstileToken: proof });
    expect((await login.json()).data).toEqual({ requires2fa: true, tempToken: 'native-totp-challenge', maskedEmail: 'p***@example.com' });
    expect(sessionCookie(login)).toBeUndefined();
    const completed = await resource.post('totp', { tempToken: 'native-totp-challenge', code: '123456' });
    expect(completed.status).toBe(200);
    expect(resource.upstreamBodies('auth/login/2fa')).toEqual([{ temp_token: 'native-totp-challenge', totp_code: '123456' }]);
    expect(sessionCookie(completed)).toBeDefined();
  });

  it('preserves per-email resend limits with Turnstile enabled', async () => {
    const resource = setup();
    expect((await resource.post('email/send-code', { email: credentials.email, turnstileToken: proof })).status).toBe(200);
    const response = await resource.post('email/send-code', { email: credentials.email.toUpperCase(), turnstileToken: 'different-proof' });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(resource.upstreamBodies('auth/send-verify-code')).toHaveLength(1);
  });

  it.each([
    ['empty', ''], ['oversized', 'x'.repeat(2049)], ['non-string', 123], ['null', null],
  ])('rejects %s proofs before upstream authentication', async (_label, turnstileToken) => {
    const resource = setup();
    expect((await resource.post('password/login', { ...credentials, turnstileToken })).status).toBe(400);
    expect((await resource.post('email/send-code', { email: credentials.email, turnstileToken })).status).toBe(400);
    expect(resource.upstreamBodies('auth/login')).toEqual([]);
    expect(resource.upstreamBodies('auth/send-verify-code')).toEqual([]);
  });

  it('accepts the documented token length boundary for both protected request contracts', () => {
    const turnstileToken = 'x'.repeat(2048);
    expect(loginInputSchema.parse({ ...credentials, turnstileToken }).turnstileToken).toBe(turnstileToken);
    expect(verificationCodeInputSchema.parse({ email: credentials.email, turnstileToken }).turnstileToken).toBe(turnstileToken);
  });
});
