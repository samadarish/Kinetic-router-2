import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sub2ApiClient, Sub2ApiOnboardingClient } from '@kineticrouter/sub2api-client';
import { signupInputSchema } from '@kineticrouter/portal-contract';
import { createApp } from '../apps/bff/src/app';
import { config } from '../apps/bff/src/config';
import { createAuthFlowStore } from '../apps/bff/src/auth-flow-store';
vi.mock('@hono/node-server/conninfo', () => ({ getConnInfo: () => ({ remote: { address: '127.0.0.1' } }) }));

const resources: ReturnType<typeof createApp>[] = [];
afterEach(async () => { await Promise.all(resources.splice(0).flatMap(r => [r.store.close(), r.authFlows.close(), r.analytics.close(), r.playgroundSettings.close(), r.conversations.close()])); });
const state = 'secure-google-state-with-32-characters';
const encode = (value: string) => Buffer.from(value).toString('base64url');
const profile = { id: 42, email: 'person@example.com', username: 'Person', status: 'active', role: 'user', balance: 0, concurrency: 1 };
const tokens = { access_token: 'private-access-token', refresh_token: 'private-refresh-token', expires_in: 900, token_type: 'Bearer' };
const baseSettings = { registration_enabled: true, email_verify_enabled: true, google_oauth_enabled: true };
const signup = { email: profile.email, password: 'correct-password', verifyCode: '012345' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ code: 0, data }), { status, headers: { 'content-type': 'application/json' } });
const failed = (message: string, status = 400) => new Response(JSON.stringify({ code: 'INVALID_CODE', message }), { status, headers: { 'content-type': 'application/json' } });

function setup(options: { settings?: Record<string, unknown>; gates?: { emailSignup: boolean; googleSignin: boolean }; pending?: boolean; redirect?: string; badAuthorize?: string; wrongStateCookie?: boolean; registerFail?: boolean; completeFail?: boolean; profile?: Record<string, unknown>; profileFail?: boolean } = {}) {
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorize.search = new URLSearchParams({ client_id: 'google-client', state, scope: 'openid email profile', response_type: 'code', redirect_uri: `${config.portalOrigin}/portal/v1/auth/google/callback` }).toString();
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/api/v1/', '');
    if (path === 'settings/public') return json({ ...baseSettings, ...options.settings });
    if (path === 'auth/send-verify-code') return json({ countdown: 60 });
    if (path === 'auth/register') {
      expect(JSON.parse(String(init?.body))).toMatchObject({ email: signup.email, password: signup.password, verify_code: signup.verifyCode });
      return options.registerFail ? failed('The verification code is incorrect.') : json({ ...tokens, user: profile });
    }
    if (path === 'auth/oauth/google/start') {
      expect(init?.method).toBe('POST');
      const response = json({ authorize_url: options.badAuthorize ?? authorize.toString() });
      response.headers.append('set-cookie', `email_oauth_state=${encode(options.wrongStateCookie ? 'wrong' : state)}; HttpOnly; Path=/api/v1/auth/oauth`);
      response.headers.append('set-cookie', `email_oauth_provider=${encode('google')}; HttpOnly; Path=/api/v1/auth/oauth`);
      response.headers.append('set-cookie', `email_oauth_redirect=${encode(url.searchParams.get('redirect')!)}; HttpOnly; Path=/api/v1/auth/oauth`);
      response.headers.append('set-cookie', 'unrelated_secret=never-forward; HttpOnly');
      return response;
    }
    if (path === 'auth/oauth/google/callback') {
      const cookies = new Headers(init?.headers).get('cookie')!;
      expect(cookies).toContain(`email_oauth_state=${encode(state)}`);
      expect(cookies).not.toContain('never-forward');
      expect(url.searchParams.get('code')).toBe('google-code');
      expect(init?.redirect).toBe('manual');
      const response = new Response(null, { status: 302, headers: { location: options.redirect ?? `${config.portalOrigin}/portal/v1/auth/google/result${options.pending ? '' : `#${new URLSearchParams({ ...tokens, expires_in: '900', redirect: 'https://evil.example' })}`}` } });
      response.headers.append('set-cookie', 'email_oauth_state=; Max-Age=0; Path=/api/v1/auth/oauth');
      if (options.pending) {
        response.headers.append('set-cookie', 'oauth_pending_session=native-pending; HttpOnly; Path=/api/v1/auth/oauth');
        response.headers.append('set-cookie', 'oauth_pending_browser_session=native-browser; HttpOnly; Path=/api/v1/auth/oauth');
      }
      return response;
    }
    if (path === 'auth/oauth/pending/exchange') {
      expect(new Headers(init?.headers).get('cookie')).toContain('oauth_pending_session=native-pending');
      return json({ provider: 'google', step: 'choose_account_action_required', create_account_allowed: true, existing_account_bindable: false, force_email_on_signup: true, email: profile.email, invitation_required: true });
    }
    if (path === 'auth/oauth/google/complete-registration') {
      expect(JSON.parse(String(init?.body))).toEqual({ password: signup.password, invitation_code: 'invite' });
      expect(new Headers(init?.headers).get('cookie')).toContain('oauth_pending_browser_session=native-browser');
      return options.completeFail ? failed('Invitation code is not valid.') : new Response(JSON.stringify(tokens), { headers: { 'content-type': 'application/json' } });
    }
    if (path === 'user/profile') {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${tokens.access_token}`);
      return options.profileFail ? failed('Profile unavailable', 503) : json(options.profile ?? profile);
    }
    throw new Error(`Unexpected upstream request ${path}`);
  });
  const result = createApp(undefined, { client: new Sub2ApiClient('https://account.invalid/api/v1', fetcher), onboardingClient: new Sub2ApiOnboardingClient('https://account.invalid/api/v1', fetcher), authGates: options.gates ?? { emailSignup: true, googleSignin: true }, analyticsEnabled: false });
  resources.push(result);
  const post = (path: string, body: unknown = {}, cookie = '', origin = config.portalOrigin) => result.app.request(`/portal/v1/auth/${path}`, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const callback = (cookie: string, query = `state=${state}&code=google-code`) => result.app.request(`/portal/v1/auth/google/callback?${query}`, { headers: { cookie } });
  return { ...result, fetcher, post, callback };
}
function cookie(response: Response, name = 'kr_onboarding') {
  return response.headers.getSetCookie().find(value => value.startsWith(`${name}=`))?.split(';')[0] ?? '';
}
async function start(flow: ReturnType<typeof setup>, next = '/api-keys') {
  const response = await flow.post('google/start', { next });
  expect(response.status).toBe(200);
  expect(cookie(response)).toMatch(/^kr_onboarding=[A-Za-z0-9_-]{43}$/);
  const set = response.headers.getSetCookie().find(value => value.startsWith('kr_onboarding='))!;
  expect(set).toContain('HttpOnly'); expect(set).toContain('SameSite=Lax');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.text()).not.toContain('private-access-token');
  return cookie(response);
}

describe('verified email signup', () => {
  it.each(['email/send-code', 'email/register', 'google/start', 'google/complete'])('requires exact Origin for %s', async path => {
    const r = setup(); const response = await r.post(path, signup, '', 'https://evil.example');
    expect(response.status).toBe(403); expect(r.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { registration_enabled: false }, { email_verify_enabled: false },
    { turnstile_enabled: true }, { tencent_captcha_enabled: true }, { aliyun_captcha_enabled: true },
  ])('blocks email registration for incompatible native settings %j', async settings => {
    const r = setup({ settings });
    expect((await r.post('email/send-code', { email: signup.email })).status).toBe(503);
    expect((await r.post('email/register', signup)).status).toBe(503);
    expect(r.fetcher.mock.calls.every(([url]) => String(url).includes('/settings/public'))).toBe(true);
  });
  it('keeps both options off behind deployment gates', async () => {
    const r = setup({ gates: { emailSignup: false, googleSignin: false } });
    expect(await (await r.app.request('/portal/v1/auth/options')).json()).toMatchObject({ data: { emailSignup: false, googleSignin: false } });
    expect((await r.post('google/start')).status).toBe(503);
  });
  it('sends one code and rate limits repeated requests case-insensitively', async () => {
    const r = setup();
    expect((await r.post('email/send-code', { email: signup.email })).status).toBe(200);
    const again = await r.post('email/send-code', { email: signup.email.toUpperCase() });
    expect(again.status).toBe(429); expect(again.headers.get('retry-after')).toBe('60');
    expect(r.fetcher.mock.calls.filter(([url]) => String(url).includes('send-verify-code'))).toHaveLength(1);
  });
  it('creates a normal encrypted portal session after native verification', async () => {
    const r = setup(); const response = await r.post('email/register', signup);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('csrfToken'); expect(text).not.toContain('private-access-token'); expect(text).not.toContain('private-refresh-token');
    const sessionCookie = cookie(response, config.sessionCookieName);
    expect((await r.store.get(sessionCookie.split('=')[1]!))?.user.id).toBe('42');
    expect((await r.store.get(sessionCookie.split('=')[1]!))?.tokens.accessToken).toBe(tokens.access_token);
  });
  it('never establishes a session after a rejected email code', async () => {
    const r = setup({ registerFail: true }); const response = await r.post('email/register', signup);
    expect(response.status).toBe(400); expect(cookie(response, config.sessionCookieName)).toBe('');
  });
  it('rejects invalid codes and oversized UTF-8 passwords before consuming a native code', async () => {
    const r = setup();
    expect(signupInputSchema.safeParse({ ...signup, password: '🔐'.repeat(19) }).success).toBe(false);
    expect((await r.post('email/register', { ...signup, password: '🔐'.repeat(19) })).status).toBe(400);
    expect((await r.post('email/register', { ...signup, verifyCode: '12345' })).status).toBe(400);
    expect(r.fetcher.mock.calls.some(([url]) => String(url).includes('/auth/register'))).toBe(false);
  });
});

describe('Google server relay', () => {
  it('binds Google state to the browser, consumes callback once, and keeps tokens off browser URLs', async () => {
    const r = setup(); const bound = await start(r, '/api-keys');
    expect((await r.callback('')).headers.get('location')).toBe('/sign-in?error=google_failed');
    expect((await r.callback(bound, 'state=wrong&code=google-code')).headers.get('location')).toBe('/sign-in?error=google_failed');
    const response = await r.callback(bound);
    expect(response.status).toBe(302); expect(response.headers.get('location')).toBe('/api-keys');
    expect(response.headers.get('set-cookie')).not.toContain('private-');
    expect(cookie(response, config.sessionCookieName)).not.toBe('');
    expect((await r.callback(bound)).headers.get('location')).toBe('/sign-in?error=google_failed');
    expect(r.fetcher.mock.calls.filter(([url]) => String(url).includes('/google/callback'))).toHaveLength(1);
  });
  it('rejects callback copies from another browser and duplicate state parameters', async () => {
    const r = setup(); const bound = await start(r);
    expect((await r.callback('kr_onboarding=unknown')).headers.get('location')).toContain('google_failed');
    expect((await r.callback(bound, `state=${state}&state=${state}&code=google-code`)).headers.get('location')).toContain('google_failed');
    expect(r.fetcher.mock.calls.some(([url]) => String(url).includes('/google/callback'))).toBe(false);
  });
  it('handles Google cancellation without an upstream exchange', async () => {
    const r = setup(); const bound = await start(r);
    const response = await r.callback(bound, `state=${state}&error=access_denied`);
    expect(response.headers.get('location')).toContain('google_cancelled');
    expect(r.fetcher.mock.calls.some(([url]) => String(url).includes('/google/callback'))).toBe(false);
  });
  it('sanitizes requested return paths', async () => {
    const r = setup(); const bound = await start(r, '//evil.example');
    expect((await r.callback(bound)).headers.get('location')).toBe('/dashboard');
  });
  it.each(['https://evil.example/steal', `${config.portalOrigin}/portal/v1/auth/google/result?access_token=bad`, `${config.portalOrigin}/portal/v1/auth/google/result#error=denied`])('rejects untrusted or malformed upstream return %s', async redirect => {
    const r = setup({ redirect }); const bound = await start(r); const response = await r.callback(bound);
    expect(response.headers.get('location')).toBe('/sign-in?error=google_failed'); expect(cookie(response, config.sessionCookieName)).toBe('');
  });
  it('rejects an untrusted authorization endpoint or inconsistent state cookie', async () => {
    for (const options of [{ badAuthorize: 'https://evil.example/authorize' }, { wrongStateCookie: true }]) {
      const r = setup(options); const response = await r.post('google/start');
      expect(response.status).toBe(502); expect(cookie(response)).toBe('');
    }
  });
  it.each([{ tencent_captcha_enabled: true }, { aliyun_captcha_enabled: true }, { google_oauth_enabled: false }])('fails closed on native Google restrictions %j', async settings => {
    expect((await setup({ settings }).post('google/start')).status).toBe(503);
  });
  it('uses native Google policy when email signup is closed', async () => {
    const r = setup({ settings: { registration_enabled: false, turnstile_enabled: true } });
    expect((await r.post('google/start')).status).toBe(200);
  });
  it('keeps first-time Google users unauthenticated until native registration completes', async () => {
    const r = setup({ pending: true }); const response = await r.callback(await start(r, '/usage'));
    expect(response.headers.get('location')).toBe('/auth/google/complete');
    expect(cookie(response, config.sessionCookieName)).toBe('');
    const bound = cookie(response);
    const view = await r.app.request('/portal/v1/auth/google/registration', { headers: { cookie: bound } });
    expect(await view.json()).toMatchObject({ data: { email: profile.email, invitationRequired: true } });
    const complete = await r.post('google/complete', { password: signup.password, invitationCode: 'invite' }, bound);
    expect(complete.status).toBe(200);
    const body = await complete.text(); expect(body).not.toContain('private-');
    expect(JSON.parse(body)).toMatchObject({ data: { next: '/usage', user: { id: '42' } } });
    expect(cookie(complete, config.sessionCookieName)).not.toBe('');
    expect((await r.post('google/complete', { password: signup.password, invitationCode: 'invite' }, bound)).status).toBe(400);
  });
  it('allows correcting a rejected invitation without discarding Google verification', async () => {
    const options = { pending: true, completeFail: true };
    const r = setup(options); const bound = cookie(await r.callback(await start(r)));
    expect((await r.post('google/complete', { password: signup.password, invitationCode: 'invite' }, bound)).status).toBe(400);
    options.completeFail = false;
    expect((await r.post('google/complete', { password: signup.password, invitationCode: 'invite' }, bound)).status).toBe(200);
  });
  it('does not admit disabled or mismatched native users', async () => {
    for (const changed of [{ ...profile, status: 'disabled' }, { ...profile, id: 43 }]) {
      const r = setup({ profile: changed });
      const response = await r.post('email/register', signup);
      expect(response.status).toBeGreaterThanOrEqual(400); expect(cookie(response, config.sessionCookieName)).toBe('');
    }
  });
  it('admits only one concurrent callback and one concurrent registration completion', async () => {
    const r = setup({ pending: true }); const bound = await start(r);
    const callbacks = await Promise.all([r.callback(bound), r.callback(bound)]);
    expect(callbacks.filter(response => response.headers.get('location') === '/auth/google/complete')).toHaveLength(1);
    const pendingCookie = cookie(callbacks.find(response => response.headers.get('location') === '/auth/google/complete')!);
    const completions = await Promise.all([r.post('google/complete', { password: signup.password, invitationCode: 'invite' }, pendingCookie), r.post('google/complete', { password: signup.password, invitationCode: 'invite' }, pendingCookie)]);
    expect(completions.map(response => response.status).sort()).toEqual([200, 400]);
    expect(r.fetcher.mock.calls.filter(([url]) => String(url).includes('/complete-registration'))).toHaveLength(1);
  });
  it('rejects completion if its profile differs from the verified Google email', async () => {
    const r = setup({ pending: true, profile: { ...profile, email: 'different@example.com' } });
    const bound = cookie(await r.callback(await start(r)));
    const complete = await r.post('google/complete', { password: signup.password, invitationCode: 'invite' }, bound);
    expect(complete.status).toBe(502); expect(cookie(complete, config.sessionCookieName)).toBe('');
    expect(await r.authFlows.get(bound.split('=')[1]!)).toBeNull();
  });
  it('offers sign-in recovery and clears the pending flow if profile loading fails after account creation', async () => {
    const r = setup({ pending: true, profileFail: true });
    const email = await r.post('email/register', signup);
    expect(email.status).toBe(409); expect(await email.text()).toContain('REGISTRATION_SIGN_IN_REQUIRED');
    const bound = cookie(await r.callback(await start(r)));
    const complete = await r.post('google/complete', { password: signup.password, invitationCode: 'invite' }, bound);
    expect(complete.status).toBe(409); expect(await complete.text()).toContain('REGISTRATION_SIGN_IN_REQUIRED');
    expect(await r.authFlows.get(bound.split('=')[1]!)).toBeNull();
    expect(cookie(complete, config.sessionCookieName)).toBe('');
  });
  it('offers sign-in recovery if portal session persistence fails after registration', async () => {
    const r = setup({ pending: true });
    vi.spyOn(r.store, 'set').mockRejectedValue(new Error('Storage unavailable'));
    const bound = cookie(await r.callback(await start(r)));
    const complete = await r.post('google/complete', { password: signup.password, invitationCode: 'invite' }, bound);
    expect(complete.status).toBe(409); expect(await complete.text()).toContain('REGISTRATION_SIGN_IN_REQUIRED');
    expect(cookie(complete, config.sessionCookieName)).toBe('');
    expect(await r.authFlows.get(bound.split('=')[1]!)).toBeNull();
  });
});

it('expires OAuth transactions and atomically consumes them', async () => {
  let now = 1000;
  const flows = createAuthFlowStore('', () => now);
  const value = { stage: 'authorize' as const, state, next: '/dashboard', cookies: {}, expiresAt: now + 600_000 };
  const id = await flows.put(value);
  const copies = await Promise.all([flows.take(id), flows.take(id)]);
  expect(copies.filter(Boolean)).toHaveLength(1);
  const expiredId = await flows.put(value); now += 600_001;
  expect(await flows.get(expiredId)).toBeNull();
  await flows.close();
});
