const readBoolean = (value: string | undefined, fallback = false) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const readInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readList = (value: string | undefined) => [...new Set((value ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean))];

const nodeEnv = process.env.NODE_ENV ?? 'development';
const portalOrigin = process.env.PORTAL_ORIGIN ?? 'http://localhost:5174';
const sessionKey = process.env.SESSION_ENCRYPTION_KEY
  ?? (nodeEnv === 'production' ? '' : 'kineticrouter-local-development-session-key');

if (!sessionKey || sessionKey.length < 32) {
  throw new Error('SESSION_ENCRYPTION_KEY must contain at least 32 characters.');
}
if (nodeEnv === 'production' && /(replace|generate|change.?me|random.?secret)/i.test(sessionKey)) {
  throw new Error('SESSION_ENCRYPTION_KEY must be generated; the example placeholder is not allowed.');
}

const defaultPublicSiteOrigins = nodeEnv === 'production'
  ? [PRODUCTION_ORIGINS.publicSite, 'https://www.kineticrouter.com']
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];
const configuredPublicSiteOrigins = readList(process.env.PUBLIC_SITE_ORIGINS);
const publicSiteOrigins = (configuredPublicSiteOrigins.length ? configuredPublicSiteOrigins : defaultPublicSiteOrigins)
  .map((value) => new URL(value).origin);

export const config = {
  nodeEnv,
  production: nodeEnv === 'production',
  port: readInteger(process.env.PORT, 3101),
  host: process.env.BFF_HOST ?? (nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1'),
  portalOrigin: new URL(portalOrigin).origin,
  sub2apiBaseUrl: (process.env.SUB2API_BASE_URL ?? `${PRODUCTION_ORIGINS.api}/api/v1`).replace(/\/+$/, ''),
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? (nodeEnv === 'production' ? '__Host-kr_session' : 'kr_session'),
  sessionEncryptionKey: sessionKey,
  sessionTtlSeconds: readInteger(process.env.SESSION_TTL_SECONDS, 7 * 24 * 60 * 60),
  redisUrl: process.env.REDIS_URL ?? '',
  trustProxy: readBoolean(process.env.TRUST_PROXY),
  enableKeyWrites: readBoolean(process.env.ENABLE_KEY_WRITES),
  enableProfileWrites: readBoolean(process.env.ENABLE_PROFILE_WRITES),
  enableRedeemWrites: readBoolean(process.env.ENABLE_REDEEM_WRITES),
  enableAnnouncementWrites: readBoolean(process.env.ENABLE_ANNOUNCEMENT_WRITES),
  publicSiteOrigins,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  serverTimezone: process.env.SERVER_TIMEZONE ?? 'Asia/Kolkata',
} as const;
import { PRODUCTION_ORIGINS } from '@kineticrouter/platform-config/origins';
