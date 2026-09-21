import { createHash } from 'node:crypto';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { googleRegistrationSchema, googleStartSchema, signupInputSchema, verificationCodeInputSchema, verificationEmailSchema, type AuthOptions } from '@kineticrouter/portal-contract';
import { Sub2ApiError, registrationRecoveryError, type AuthenticatedResult, type Sub2ApiOnboardingClient } from '@kineticrouter/sub2api-client';
import { resolveConsoleReturnPath } from '@kineticrouter/platform-config/routes';
import { config } from './config.js';
import { constantTimeEqual } from './crypto.js';
import type { AuthFlow, AuthFlowStore } from './auth-flow-store.js';
import type { PortalSession, SessionStore } from './session-store.js';
import { logger } from './logger.js';

type Env = { Variables: { requestId: string; sessionId?: string; session?: PortalSession } };
export type OnboardingClient = Pick<Sub2ApiOnboardingClient, 'sendVerificationCode' | 'register' | 'googleStart' | 'googleCallback' | 'googlePending' | 'googleCompleteRegistration' | 'authenticatedResult'>;
export type AuthGates = { emailSignup: boolean; googleSignin: boolean };
const prefix = '/portal/v1/auth';
const cookieName = config.production ? '__Host-kr_onboarding' : 'kr_onboarding';
const cookieOptions = { path: '/', httpOnly: true, secure: config.production, sameSite: 'Lax' as const };

export function onboardingOptions(settings: Record<string, unknown>, gates: AuthGates): AuthOptions {
  const actionCaptcha = settings.tencent_captcha_enabled === true || settings.aliyun_captcha_enabled === true;
  const turnstileEnabled = settings.turnstile_enabled === true;
  const configuredSiteKey = typeof settings.turnstile_site_key === 'string' ? settings.turnstile_site_key.trim() : '';
  const siteKey = turnstileEnabled && /^[A-Za-z0-9_-]{1,256}$/.test(configuredSiteKey) ? configuredSiteKey : null;
  return {
    emailSignup: gates.emailSignup && settings.registration_enabled === true && settings.email_verify_enabled === true && !actionCaptcha && (!turnstileEnabled || siteKey !== null),
    googleSignin: gates.googleSignin && settings.google_oauth_enabled === true && !actionCaptcha,
    invitationRequired: settings.invitation_code_enabled === true,
    turnstile: { enabled: turnstileEnabled, siteKey },
  };
}

export function installOnboardingRoutes(app: Hono<Env>, options: {
  client: OnboardingClient; flows: AuthFlowStore; sessions: SessionStore; gates: AuthGates;
  settings: () => Promise<Record<string, unknown>>;
  requireOrigin: MiddlewareHandler<Env>; rateLimit: MiddlewareHandler<Env>;
  finish: (c: Context<Env>, result: AuthenticatedResult) => Promise<Response>;
}) {
  const { client, flows, sessions, gates, settings, finish } = options;
  const callbackUrl = `${config.portalOrigin}${prefix}/google/callback`;
  const resultUrl = `${config.portalOrigin}${prefix}/google/result`;
  const ok = (c: Context<Env>, data: unknown) => c.json({ ok: true, data, requestId: c.get('requestId') });
  const clear = (c: Context<Env>) => deleteCookie(c, cookieName, cookieOptions);
  const save = async (c: Context<Env>, flow: AuthFlow) => {
    const id = await flows.put(flow);
    setCookie(c, cookieName, id, { ...cookieOptions, maxAge: Math.max(1, Math.floor((flow.expiresAt - Date.now()) / 1000)) });
  };
  const ensure = async (kind: 'emailSignup' | 'googleSignin') => {
    if (!onboardingOptions(await settings(), gates)[kind]) throw new Sub2ApiError({ status: 503, code: 'AUTH_UNAVAILABLE', message: 'This sign-in option is not available yet.' });
  };
  const registration = async (c: Context<Env>) => {
    const id = getCookie(c, cookieName) ?? '';
    const flow = await flows.get(id);
    if (!flow || flow.stage !== 'registration' || !flow.email) {
      clear(c);
      throw new Sub2ApiError({ status: 400, code: 'GOOGLE_FLOW_EXPIRED', message: 'Your Google sign-in has expired. Start again from the sign-in page.' });
    }
    return { id, flow };
  };
  app.get(`${prefix}/options`, async c => ok(c, onboardingOptions(await settings(), gates)));
  app.post(`${prefix}/email/send-code`, options.requireOrigin, options.rateLimit, async c => {
    await ensure('emailSignup');
    const { email, turnstileToken } = verificationCodeInputSchema.parse(await c.req.json());
    const emailKey = createHash('sha256').update(email.toLowerCase()).digest('hex');
    if (await sessions.hitRateLimit(`verify-minute:${emailKey}`, 1, 60) || await sessions.hitRateLimit(`verify-hour:${emailKey}`, 5, 3600)) {
      c.header('Retry-After', '60');
      throw new Sub2ApiError({ status: 429, code: 'VERIFY_RATE_LIMIT', message: 'Please wait before requesting another verification code.' });
    }
    return ok(c, await client.sendVerificationCode(email, turnstileToken));
  });
  app.post(`${prefix}/email/register`, options.requireOrigin, options.rateLimit, async c => {
    await ensure('emailSignup');
    const result = await client.register(signupInputSchema.parse(await c.req.json()));
    try { return await finish(c, result); }
    catch { throw registrationRecoveryError(); }
  });
  app.post(`${prefix}/google/start`, options.requireOrigin, options.rateLimit, async c => {
    await ensure('googleSignin');
    const next = resolveConsoleReturnPath(googleStartSchema.parse(await c.req.json()).next);
    const reply = await client.googleStart(next);
    let url: URL;
    try { url = new URL(String(reply.data.authorize_url)); }
    catch { throw invalidGoogleReply(); }
    const state = url.searchParams.get('state') ?? '';
    const scopes = (url.searchParams.get('scope') ?? '').split(' ');
    if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth' || url.username || url.password || url.hash || url.searchParams.get('redirect_uri') !== callbackUrl || url.searchParams.get('response_type') !== 'code' || !url.searchParams.get('client_id') || !scopes.includes('openid') || !scopes.includes('email') || !/^[A-Za-z0-9_-]{20,256}$/.test(state) || decodeCookie(reply.cookies.email_oauth_state) !== state || decodeCookie(reply.cookies.email_oauth_provider) !== 'google') throw invalidGoogleReply();
    const previous = getCookie(c, cookieName);
    if (previous) await flows.take(previous);
    await save(c, { stage: 'authorize', state, cookies: reply.cookies, next, expiresAt: Date.now() + 600_000 });
    return ok(c, { authorizeUrl: url.toString() });
  });
  app.get(`${prefix}/google/callback`, async c => {
    try {
      await ensure('googleSignin');
      const id = getCookie(c, cookieName) ?? '';
      const flow = await flows.get(id);
      const query = new URL(c.req.url).searchParams;
      const state = query.get('state') ?? '';
      if (!flow || flow.stage !== 'authorize' || query.getAll('state').length !== 1 || !constantTimeEqual(state, flow.state)) throw invalidGoogleReply();
      const consumed = await flows.take(id);
      if (!consumed || consumed.stage !== 'authorize') throw invalidGoogleReply();
      const code = query.get('code');
      const error = query.get('error');
      if (error === 'access_denied') { clear(c); return c.redirect(`/sign-in?error=google_cancelled&next=${encodeURIComponent(flow.next)}`); }
      if (!code || code.length > 8192 || error || query.getAll('code').length !== 1) throw invalidGoogleReply();
      const reply = await client.googleCallback({ state, code }, flow.cookies);
      if (!reply.location) throw invalidGoogleReply();
      const target = new URL(reply.location, config.portalOrigin);
      if (`${target.origin}${target.pathname}` !== resultUrl || target.search || target.username || target.password) throw invalidGoogleReply();
      if (target.hash) {
        const tokens = new URLSearchParams(target.hash.slice(1));
        for (const key of ['access_token', 'refresh_token', 'expires_in', 'token_type']) if (tokens.getAll(key).length !== 1) throw invalidGoogleReply();
        const result = await client.authenticatedResult(Object.fromEntries(tokens));
        await finish(c, result);
        clear(c);
        return c.redirect(flow.next);
      }
      const pending = await client.googlePending(reply.cookies);
      const data = pending.data;
      const email = data.resolved_email ?? data.email;
      if (data.provider !== 'google' || data.step !== 'choose_account_action_required' || data.create_account_allowed !== true || data.existing_account_bindable === true || data.force_email_on_signup !== true || typeof email !== 'string' || !verificationEmailSchema.safeParse({ email }).success || !pending.cookies.oauth_pending_session || !pending.cookies.oauth_pending_browser_session) throw invalidGoogleReply();
      await save(c, { ...flow, stage: 'registration', cookies: pending.cookies, email, invitationRequired: data.invitation_required === true });
      return c.redirect('/auth/google/complete');
    } catch {
      clear(c);
      logger.warn({ requestId: c.get('requestId') }, 'Google sign-in could not be completed');
      return c.redirect('/sign-in?error=google_failed');
    }
  });
  app.get(`${prefix}/google/registration`, async c => {
    await ensure('googleSignin');
    const { flow } = await registration(c);
    return ok(c, { email: flow.email, invitationRequired: flow.invitationRequired === true });
  });
  app.post(`${prefix}/google/complete`, options.requireOrigin, options.rateLimit, async c => {
    await ensure('googleSignin');
    const input = googleRegistrationSchema.parse(await c.req.json());
    const id = getCookie(c, cookieName) ?? '';
    return sessions.withLock(`oauth:${id}`, async () => {
      const { flow } = await registration(c);
      let result: AuthenticatedResult;
      try { result = await client.googleCompleteRegistration(input, flow.cookies); }
      catch (error) {
        if (error instanceof Sub2ApiError && (error.code === 'REGISTRATION_SIGN_IN_REQUIRED' || error.code.startsWith('PENDING_AUTH_'))) { await flows.take(id); clear(c); }
        throw error;
      }
      await flows.take(id);
      if (result.user.email.trim().toLowerCase() !== flow.email!.trim().toLowerCase()) { clear(c); throw invalidGoogleReply(); }
      clear(c);
      let response: Response;
      try { response = await finish(c, result); }
      catch { throw registrationRecoveryError(); }
      // Keep the caller's return path server-controlled through completion.
      const body = await response.json();
      return ok(c, { ...body.data, next: flow.next });
    });
  });
}

function decodeCookie(value: string | undefined) {
  try { return Buffer.from(value ?? '', 'base64url').toString('utf8'); } catch { return ''; }
}
function invalidGoogleReply() {
  return new Sub2ApiError({ status: 502, code: 'GOOGLE_CONFIGURATION_INVALID', message: 'Google sign-in is temporarily unavailable.' });
}
