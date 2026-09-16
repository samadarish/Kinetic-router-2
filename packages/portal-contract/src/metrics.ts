import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const money = z.string().regex(/^-?\d+(\.\d+)?$/);
export const metricsQuerySchema = z.object({
  range: z.enum(['custom', 'all-time']).default('custom'),
  startDate: day.optional(), endDate: day.optional(),
  activityPage: z.coerce.number().int().min(1).max(10000).default(1),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).default(''),
  cohort: z.enum(['all', 'heavy', 'light', 'regular', 'none']).default('all'),
  source: z.enum(['console', 'api']).default('api'),
}).refine(q => q.range === 'all-time' || (q.startDate !== undefined && q.endDate !== undefined && q.startDate <= q.endDate && Date.parse(q.endDate) - Date.parse(q.startDate) <= 396 * 86400000), 'Choose a valid range of up to thirteen months, or All time.');
export type MetricsQuery = z.infer<typeof metricsQuerySchema>;
export const metricsAveragesQuerySchema = z.object({ scope: z.enum(['today', 'all-time']).default('today') });
export const metricsPeaksQuerySchema = metricsAveragesQuerySchema;
export const metricsRangeSchema = z.object({ mode: z.enum(['custom', 'all-time']), startDate: day.nullable(), endDate: day });
export type MetricsRange = z.infer<typeof metricsRangeSchema>;
export const metricsCoverageSchema = z.object({
  availableFrom: z.string().nullable(), through: z.string(), complete: z.boolean(),
  basis: z.enum(['retained-api-history', 'console-observations']),
  storage: z.enum(['upstream', 'postgres', 'memory']),
  notice: z.string(),
});
export type MetricsCoverage = z.infer<typeof metricsCoverageSchema>;
const meta = z.object({ generatedAt: z.string(), timezone: z.string(), coverage: metricsCoverageSchema });
export const metricsUserSchema = z.object({
  id: z.string(), username: z.string(), email: z.string(), status: z.string(),
  requests: count, actualCost: money, score: z.number().finite(),
  cohort: z.enum(['heavy', 'light', 'regular', 'none']),
});
export type MetricsUser = z.infer<typeof metricsUserSchema>;
export const metricsUsersSchema = meta.extend({ range: metricsRangeSchema, items: z.array(metricsUserSchema), total: count, page: count, pageSize: count });
export type MetricsUsers = z.infer<typeof metricsUsersSchema>;
export const metricsOverviewSchema = meta.extend({
  range: metricsRangeSchema,
  totalUsers: count, requests: count, actualCost: money, apiDau: count.nullable(), consoleDau: count.nullable(), dauDate: day,
  heavyUsers: count, lightUsers: count, noUsageUsers: count,
  consoleNotice: z.string().nullable(),
});
export type MetricsOverview = z.infer<typeof metricsOverviewSchema>;
export type MetricsBucket = { period: string; level: 'week' | 'day' | 'hour'; users: number; requests: number; actualCost: string; covered: boolean; partial: boolean; children: MetricsBucket[] };
export const metricsBucketSchema: z.ZodType<MetricsBucket> = z.lazy(() => z.object({
  period: z.string(), level: z.enum(['week', 'day', 'hour']), users: count, requests: count, actualCost: money,
  covered: z.boolean(), partial: z.boolean(), children: z.array(metricsBucketSchema),
}));
export const metricsUsageWindowSchema = z.object({
  startAt: z.string().datetime(), endAt: z.string().datetime(), requests: count, actualCost: money,
});
export type MetricsUsageWindow = z.infer<typeof metricsUsageWindowSchema>;
export const metricsFiveHourPeaksSchema = z.object({
  status: z.enum(['ready', 'insufficient-history', 'unsupported-timezone']),
  eligibleWindows: count,
  mostRequests: metricsUsageWindowSchema.nullable(), highestSpend: metricsUsageWindowSchema.nullable(),
});
export type MetricsFiveHourPeaks = z.infer<typeof metricsFiveHourPeaksSchema>;
export const metricsActiveUsageSchema = z.object({
  status: z.enum(['ready', 'insufficient-history', 'unsupported-timezone']),
  completedThrough: z.string().datetime().nullable(),
  completedHours: count.nullable(), activeHours: count.nullable(),
  totalRequests: count.nullable(), actualCost: money.nullable(),
  hourly: z.object({ requests: z.number().finite().nonnegative(), actualCost: money }).nullable(),
  fiveHourly: z.object({ requests: z.number().finite().nonnegative(), actualCost: money }).nullable(),
});
export type MetricsActiveUsage = z.infer<typeof metricsActiveUsageSchema>;
export const metricsUsageTrendSchema = z.object({
  granularity: z.enum(['hour', 'day']),
  points: z.array(z.object({ period: z.string(), users: count, requests: count, actualCost: money, covered: z.boolean(), partial: z.boolean() })),
});
export type MetricsUsageTrend = z.infer<typeof metricsUsageTrendSchema>;
export const metricsPeaksSchema = meta.extend({
  scope: z.enum(['today', 'all-time']), reportingDate: day,
  fiveHourPeaks: metricsFiveHourPeaksSchema,
  activeUsage: metricsActiveUsageSchema,
  usageTrend: metricsUsageTrendSchema,
});
export type MetricsPeaks = z.infer<typeof metricsPeaksSchema>;
export const metricsActivitySchema = meta.extend({
  range: metricsRangeSchema,
  pagination: z.object({ page: count, pageSize: count, totalPages: count, totalWeeks: count, startDate: day.nullable(), endDate: day.nullable() }).nullable(),
  source: z.enum(['console', 'api']), weeks: z.array(metricsBucketSchema),
  heatmap: z.array(z.object({ weekday: count, hour: count, occurrences: count, users: z.number().nonnegative(), requests: z.number().nonnegative(), actualCost: money })),
  peakUsers: metricsBucketSchema.nullable(), peakRequests: metricsBucketSchema.nullable(),
  fiveHourPeaks: metricsFiveHourPeaksSchema.nullable(),
  activeUsage: metricsActiveUsageSchema.nullable(),
  usageTrend: metricsUsageTrendSchema,
});
export type MetricsActivity = z.infer<typeof metricsActivitySchema>;
export const metricsAveragesSchema = meta.extend({
  scope: z.enum(['today', 'all-time']),
  reportingDate: day, periodStart: z.string().datetime().nullable(), elapsedHours: z.number().nonnegative(),
  totalRequests: count, actualCost: money,
  hourly: z.object({ requests: z.number().nonnegative(), actualCost: money }).nullable(),
  fiveHourly: z.object({ requests: z.number().nonnegative(), actualCost: money }).nullable(),
  weekly: z.object({ requests: z.number().nonnegative(), actualCost: money }).nullable(),
});
export type MetricsAverages = z.infer<typeof metricsAveragesSchema>;
