const baseUrl = (process.env.PORTAL_SMOKE_URL ?? 'http://localhost:5174').replace(/\/$/, '');
const origin = process.env.PORTAL_SMOKE_ORIGIN ?? 'http://localhost:5174';
const publicSiteOrigin = process.env.PORTAL_SMOKE_PUBLIC_SITE_ORIGIN ?? 'http://localhost:3000';
const email = process.env.PORTAL_SMOKE_EMAIL;
const password = process.env.PORTAL_SMOKE_PASSWORD;

if (!email || !password) {
  console.error('Set PORTAL_SMOKE_EMAIL and PORTAL_SMOKE_PASSWORD for the dedicated test account.');
  process.exit(2);
}

let cookie = '';
let csrfToken = '';
let sessionCookieAttributes = '';

async function call(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Origin', origin);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (cookie) headers.set('Cookie', cookie);
  if (csrfToken && !['GET', 'HEAD'].includes(init.method ?? 'GET')) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, redirect: 'manual' });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    cookie = setCookie.split(';', 1)[0];
    sessionCookieAttributes = setCookie;
  }
  if (!response.headers.get('cache-control')?.includes('no-store')) throw new Error(`${path}: authenticated response is cacheable`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(`${path}: ${payload?.error?.code ?? response.status} ${payload?.error?.message ?? ''}`);
  return payload.data;
}

const checks = [];
async function check(label, task) {
  const started = Date.now();
  await task();
  checks.push({ label, ms: Date.now() - started });
}

let smokeError;
try {
  await check('static console', async () => {
    const response = await fetch(`${baseUrl}/sign-in`, { redirect: 'manual' });
    const html = await response.text();
    if (!response.ok || !html.includes('id="root"')) throw new Error('static console check failed');
    if (baseUrl.startsWith('https://')) {
      if (!response.headers.get('strict-transport-security')) throw new Error('public console is missing HSTS');
      if (!response.headers.get('content-security-policy')) throw new Error('public console is missing Content-Security-Policy');
      if (response.headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff') throw new Error('public console is missing nosniff');
    }
  });
  await check('readiness', async () => {
    const response = await fetch(`${baseUrl}/readyz`);
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.status !== 'ready') throw new Error('readiness check failed');
  });
  await check('public logout CORS preflight', async () => {
    const response = await fetch(`${baseUrl}/portal/v1/auth/logout`, {
      method: 'OPTIONS',
      headers: {
        Origin: publicSiteOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Accept, Content-Type',
      },
    });
    if (response.status !== 204) throw new Error(`logout preflight returned ${response.status}`);
    if (response.headers.get('access-control-allow-origin') !== publicSiteOrigin) {
      throw new Error('logout preflight did not echo the allowlisted public origin');
    }
    if (response.headers.get('access-control-allow-credentials') !== 'true') {
      throw new Error('logout preflight does not allow credentials');
    }
    const methods = response.headers.get('access-control-allow-methods') ?? '';
    if (!methods.split(',').map((method) => method.trim().toUpperCase()).includes('POST')) {
      throw new Error('logout preflight does not allow POST');
    }
  });
  await check('login', async () => {
    const result = await call('/portal/v1/auth/password/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (result.requires2fa) throw new Error('The smoke user requires interactive TOTP.');
    const serialized = JSON.stringify(result);
    if (serialized.includes('access_token') || serialized.includes('refresh_token') || serialized.includes('accessToken') || serialized.includes('refreshToken')) {
      throw new Error('login exposed an upstream bearer token');
    }
    if (!/HttpOnly/i.test(sessionCookieAttributes) || !/SameSite=Lax/i.test(sessionCookieAttributes)) {
      throw new Error('session cookie is missing HttpOnly or SameSite=Lax');
    }
    csrfToken = result.csrfToken;
  });
  await check('session', async () => { await call('/portal/v1/auth/session'); });
  await check('dashboard', async () => { await call('/portal/v1/dashboard'); });
  await check('profile', async () => { await call('/portal/v1/me'); });
  await check('groups', async () => { await call('/portal/v1/groups'); });
  await check('api keys', async () => { await call('/portal/v1/api-keys?page=1&pageSize=5'); });
  await check('usage summary', async () => { await call('/portal/v1/usage/summary'); });
  await check('usage events', async () => { await call('/portal/v1/usage/events?page=1&pageSize=5'); });
  await check('subscriptions', async () => { await call('/portal/v1/subscriptions'); });
  await check('redemption history', async () => { await call('/portal/v1/redemptions'); });
  await check('channel status', async () => { await call('/portal/v1/channels/status'); });
  await check('announcements', async () => { await call('/portal/v1/announcements'); });
} catch (error) {
  smokeError = error;
} finally {
  if (cookie) {
    try {
      await check('logout', async () => { await call('/portal/v1/auth/logout', { method: 'POST', body: '{}' }); });
    } catch (logoutError) {
      if (!smokeError) smokeError = logoutError;
    }
  }
}

if (smokeError) throw smokeError;

for (const item of checks) console.log(`PASS ${item.label} (${item.ms}ms)`);
console.log(`Read-only portal smoke test passed: ${checks.length} checks.`);
