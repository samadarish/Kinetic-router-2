import { Sub2ApiClient, Sub2ApiError, asRecord, mapUser, type LoginResult } from './index.js';

export type OAuthCookieJar = Record<string, string>;
export type AuthenticatedResult = Extract<LoginResult, { requires2fa: false }>;
export type SignupInput = { email: string; password: string; verifyCode: string; invitationCode?: string };
export type OAuthReply = { data: Record<string, unknown>; cookies: OAuthCookieJar; location?: string };
const cookieNames = new Set(['email_oauth_state', 'email_oauth_redirect', 'email_oauth_provider', 'email_oauth_affiliate', 'oauth_pending_browser_session', 'oauth_pending_session', 'oauth_promo_code']);

// Contracts pinned to Sub2API 0.1.183. OAuth credentials and email delivery stay
// with the existing identity service; only its own tokens establish portal users.
export class Sub2ApiOnboardingClient {
  private readonly client: Sub2ApiClient;
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {
    this.client = new Sub2ApiClient(baseUrl, fetcher);
  }

  async sendVerificationCode(email: string, turnstileToken?: string) {
    const data = asRecord(await this.client.request('auth/send-verify-code', {
      method: 'POST', body: JSON.stringify({ email, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) }),
    }, { userUiRequest: false }));
    const countdown = Number(data.countdown);
    return { countdown: Number.isFinite(countdown) ? Math.min(600, Math.max(60, Math.ceil(countdown))) : 60 };
  }

  async register(input: SignupInput): Promise<AuthenticatedResult> {
    const data = asRecord(await this.client.request('auth/register', {
      method: 'POST', body: JSON.stringify({ email: input.email, password: input.password, verify_code: input.verifyCode, ...(input.invitationCode ? { invitation_code: input.invitationCode } : {}) }),
    }, { userUiRequest: false }));
    try {
      const result = await this.authenticatedResult(data);
      if (result.user.email.trim().toLowerCase() !== input.email.trim().toLowerCase()) throw invalidReply();
      return result;
    }
    catch { throw registrationRecoveryError(); }
  }

  googleStart(next: string) {
    return this.oauthRequest(`auth/oauth/google/start?${new URLSearchParams({ redirect: next })}`, 'POST', {}, {});
  }

  googleCallback(query: { state: string; code?: string; error?: string }, cookies: OAuthCookieJar) {
    return this.oauthRequest(`auth/oauth/google/callback?${new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))}`, 'GET', undefined, cookies);
  }

  googlePending(cookies: OAuthCookieJar) {
    return this.oauthRequest('auth/oauth/pending/exchange', 'POST', {}, cookies);
  }

  async googleCompleteRegistration(input: { password: string; invitationCode?: string }, cookies: OAuthCookieJar) {
    const reply = await this.oauthRequest('auth/oauth/google/complete-registration', 'POST', {
      password: input.password, ...(input.invitationCode ? { invitation_code: input.invitationCode } : {}),
    }, cookies);
    try { return await this.authenticatedResult(reply.data); }
    catch { throw registrationRecoveryError(); }
  }

  async authenticatedResult(data: Record<string, unknown>): Promise<AuthenticatedResult> {
    const accessToken = typeof data.access_token === 'string' ? data.access_token : '';
    const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : '';
    const expiresIn = Number(data.expires_in);
    if (!accessToken || accessToken.length > 16_384 || !refreshToken || refreshToken.length > 16_384 || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 31 * 86_400 || (data.token_type && data.token_type !== 'Bearer')) throw invalidReply();
    const profile = asRecord(await this.client.request('user/profile', {}, { accessToken }));
    const id = String(profile.id ?? '');
    const responseId = asRecord(data.user).id;
    if (!id || id.length > 128 || (responseId !== undefined && String(responseId) !== id) || typeof profile.email !== 'string' || !profile.email.includes('@')) throw invalidReply();
    if (profile.status !== 'active') throw new Sub2ApiError({ status: 403, code: 'ACCOUNT_UNAVAILABLE', message: 'This account is not available for sign-in.' });
    return { requires2fa: false, user: mapUser(profile), tokens: { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 } };
  }

  private async oauthRequest(path: string, method: 'GET' | 'POST', body: unknown, cookies: OAuthCookieJar): Promise<OAuthReply> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl.replace(/\/+$/, '')}/${path}`, {
        method, redirect: 'manual', signal: AbortSignal.timeout(18_000),
        headers: { Accept: 'application/json', 'Accept-Language': 'en', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Cookie: Object.entries(cookies).filter(([name, value]) => cookieNames.has(name) && /^[A-Za-z0-9_\-%.=]+$/.test(value)).map(([name, value]) => `${name}=${value}`).join('; ') },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Sub2ApiError({ status: 502, code: 'OAUTH_UNAVAILABLE', message: 'Google sign-in is temporarily unavailable.' }); }
    const updated = { ...cookies };
    for (const cookie of response.headers.getSetCookie()) {
      const match = /^([^=;]+)=([^;]*)/.exec(cookie);
      const name = match?.[1];
      const value = match?.[2];
      if (!name || !cookieNames.has(name) || value === undefined) continue;
      if (!value || /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(cookie)) delete updated[name];
      else if (value.length <= 8192 && /^[A-Za-z0-9_\-%.=]+$/.test(value)) updated[name] = value;
      else throw invalidReply();
    }
    const location = response.headers.get('location') ?? undefined;
    if ([302, 303].includes(response.status) && location && location.length <= 40_000) return { data: {}, cookies: updated, location };
    const envelope = asRecord(await response.json().catch(() => null));
    if (!response.ok || (envelope.code !== undefined && Number(envelope.code) !== 0)) {
      throw new Sub2ApiError({ status: response.ok ? 400 : response.status, code: typeof envelope.code === 'string' ? envelope.code : undefined, message: typeof envelope.message === 'string' ? envelope.message : 'Google sign-in could not be completed.' });
    }
    return { data: asRecord(envelope.data ?? envelope), cookies: updated };
  }
}

function invalidReply() {
  return new Sub2ApiError({ status: 502, code: 'INVALID_AUTH_RESPONSE', message: 'The account service returned an invalid sign-in response.' });
}

export function registrationRecoveryError() {
  return new Sub2ApiError({ status: 409, code: 'REGISTRATION_SIGN_IN_REQUIRED', message: 'Your account was created, but sign-in could not finish. Sign in with your email and password, or start Google sign-in again.' });
}
