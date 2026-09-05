import type { AnalyticsAction, AnalyticsClientEvent, AnalyticsQuery, AnalyticsSurface } from '@kineticrouter/portal-contract';

export const DAY_MS = 86_400_000;
export const SESSION_MS = 30 * 60_000;
export type ReportKind = 'overview' | 'pages' | 'acquisition' | 'actions' | 'performance';
export type Acquisition = { referrer: string; source: string; medium: string; campaign: string; device: string; browser: string; os: string };
export type AnalyticsSession = Acquisition & {
  id: string; visitorId: string; startedAt: number; lastSeen: number; firstSeen: number;
  entryPath?: string; entrySurface?: AnalyticsSurface; entryAt?: number; entryId?: string;
  exitPath?: string; exitSurface?: AnalyticsSurface; exitAt?: number; exitId?: string;
};
export type StoredEvent = Omit<AnalyticsClientEvent, 'name'> & {
  name: AnalyticsClientEvent['name'] | Exclude<AnalyticsAction, 'cta_click' | 'docs_copy'>;
  visitorId: string; sessionId: string; surface: AnalyticsSurface; day: string;
};
export type PageFact = { pageId: string; day: string; sessionId: string; visitorId: string; surface: AnalyticsSurface; path: string; at: number; views: number; engagementMs: number };
export interface AnalyticsStore {
  kind: 'memory' | 'postgres';
  session(visitorId: string, acquisition: Acquisition, now: number): Promise<AnalyticsSession>;
  write(events: StoredEvent[]): Promise<void>;
  report(kind: ReportKind, query: AnalyticsQuery, now: number): Promise<unknown>;
  maintain(now: number): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
export function analyticsDay(at: number, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(at);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)!.value).join('-');
}
export function retentionDay(now: number, timezone: string) {
  const current = new Date(`${analyticsDay(now, timezone)}T12:00:00Z`);
  const date = current.getUTCDate();
  current.setUTCMonth(current.getUTCMonth() - 13, 1);
  const lastDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate();
  current.setUTCDate(Math.min(date, lastDate));
  return current.toISOString().slice(0, 10);
}
export function previousRange(query: AnalyticsQuery) {
  const length = Date.parse(query.endDate) - Date.parse(query.startDate) + DAY_MS;
  return { ...query, startDate: new Date(Date.parse(query.startDate) - length).toISOString().slice(0, 10), endDate: new Date(Date.parse(query.startDate) - DAY_MS).toISOString().slice(0, 10) };
}
export function normalizePath(value: string, surface: AnalyticsSurface) {
  let path: string;
  try { path = new URL(value, 'https://analytics.invalid').pathname.replace(/\/+$/, '') || '/'; } catch { return '/other'; }
  if (surface === 'console') return /^\/(sign-in|dashboard|api-keys|usage|status|subscriptions|redeem|profile)$/.test(path) ? path : '/other';
  if (/^\/(?:|pricing|quickstart|vibe-coding|privacy|terms-of-service|models(?:\/[a-zA-Z0-9._-]{1,100}){0,3}|docs(?:\/[a-zA-Z0-9._-]{1,100}){0,8}|account\/(?:sign-in|sign-up|verify-email))$/.test(path)) return path;
  return '/other';
}
export function metricRating(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const limits = metric === 'LCP' ? [2500, 4000] : metric === 'INP' ? [200, 500] : [0.1, 0.25];
  return value <= limits[0]! ? 'good' : value <= limits[1]! ? 'needs-improvement' : 'poor';
}
export const ACTIONS: AnalyticsAction[] = ['cta_click', 'docs_copy', 'sign_in', 'api_key_created', 'redemption'];
