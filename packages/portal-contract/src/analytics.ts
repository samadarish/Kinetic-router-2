import { z } from 'zod';

export const analyticsSurfaceSchema = z.enum(['site', 'console']);
export type AnalyticsSurface = z.infer<typeof analyticsSurfaceSchema>;
export type AnalyticsScope = AnalyticsSurface | 'all';
const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
export const analyticsBootstrapSchema = z.object({
  tabId: uuid,
  referrer: z.string().max(2048).default(''),
  source: z.string().max(100).default(''),
  medium: z.string().max(100).default(''),
  campaign: z.string().max(100).default(''),
  // Accepted for older clients during rollout; no longer controls collection.
  disabled: z.boolean().optional(),
}).strict();
export const analyticsEventSchema = z.object({
  id: uuid, pageId: uuid, at: z.number().int().nonnegative(), path: z.string().max(512),
  name: z.enum(['page_view', 'engagement', 'cta_click', 'docs_copy', 'web_vital']),
  day: day.optional(), engagementMs: z.number().int().min(0).max(86_400_000).optional(),
  metric: z.enum(['LCP', 'INP', 'CLS']).optional(), value: z.number().finite().nonnegative().max(600_000).optional(),
  metricId: z.string().max(100).optional(),
}).strict().superRefine((event, ctx) => {
  if (event.name === 'engagement' && (event.day === undefined || event.engagementMs === undefined)) ctx.addIssue({ code: 'custom', message: 'Engagement requires a day and cumulative duration.' });
  if (event.name === 'web_vital' && (event.metric === undefined || event.value === undefined || !event.metricId)) ctx.addIssue({ code: 'custom', message: 'A performance measurement is required.' });
});
export type AnalyticsClientEvent = z.infer<typeof analyticsEventSchema>;
export const analyticsCollectSchema = z.object({
  token: z.string().min(1).max(4096), tabId: uuid, path: z.string().max(512),
  sentAt: z.number().int().nonnegative(), sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  visible: z.boolean(), events: z.array(analyticsEventSchema).max(20),
}).strict();
export const analyticsQuerySchema = z.object({
  startDate: day, endDate: day,
  surface: z.enum(['all', 'site', 'console']).default('all'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).default(''),
}).refine(q => q.startDate <= q.endDate && Date.parse(q.endDate) - Date.parse(q.startDate) <= 396 * 86_400_000, 'Choose a range of up to thirteen months.');
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsBootstrap = { enabled: boolean; token?: string; expiresAt?: number; visitorId?: string; sessionId?: string; timezone: string };
export type AnalyticsTotals = { visitors: number; sessions: number; pageviews: number; newVisitors: number; returningVisitors: number; engagementRate: number; bounceRate: number; averageEngagementMs: number };
export type AnalyticsOverview = {
  generatedAt: string; timezone: string; storage: 'memory' | 'postgres';
  range: { startDate: string; endDate: string; previousStartDate: string; previousEndDate: string; comparisonAvailable: boolean };
  totals: AnalyticsTotals; previous: AnalyticsTotals;
  trend: Array<{ date: string; visitors: number; sessions: number; pageviews: number }>;
};
export type AnalyticsPageRow = { surface: AnalyticsSurface; path: string; visitors: number; pageviews: number; engagementMs: number; entrances: number; exits: number };
export type AnalyticsPages = { items: AnalyticsPageRow[]; total: number; page: number; pageSize: number };
export type AnalyticsBreakdown = { label: string; visitors: number; sessions: number };
export type AnalyticsAcquisition = { referrers: AnalyticsBreakdown[]; sources: AnalyticsBreakdown[]; campaigns: AnalyticsBreakdown[]; devices: AnalyticsBreakdown[]; browsers: AnalyticsBreakdown[]; operatingSystems: AnalyticsBreakdown[] };
export type AnalyticsAction = 'cta_click' | 'docs_copy' | 'sign_in' | 'api_key_created' | 'redemption';
export type AnalyticsActions = { actions: Array<{ name: AnalyticsAction; count: number; sessions: number }>; funnel: Array<{ name: string; sessions: number }>; funnelAvailable: boolean };
export type AnalyticsPerformance = { items: Array<{ surface: AnalyticsSurface; path: string; metric: 'LCP' | 'INP' | 'CLS'; p75: number; samples: number; rating: 'good' | 'needs-improvement' | 'poor' }>; estimated: boolean };
export type AnalyticsLive = {
  generatedAt: string; activeWindowSeconds: number; visitors: number; customers: number; activeTabs: number;
  items: Array<{ id: string; label: string; authenticated: boolean; surface: AnalyticsSurface; path: string; device: string; lastSeen: string; tabs: number }>;
  pages: Array<{ surface: AnalyticsSurface; path: string; visitors: number; tabs: number }>;
  total: number; page: number; pageSize: number;
  health: { collected: number; rejected: number; dropped: number; lastEventAt: string | null; storageAvailable: boolean; presenceResetAt: string };
};
