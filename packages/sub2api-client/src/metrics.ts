export type MetricsCustomer = { id: string; username: string; email: string; status: string };
export type CustomerUsagePoint = { period: string; userId: string; requests: number; actualCost: string };
export class MetricsSourceError extends Error {
  constructor(message = 'The account service returned an unsupported metrics response.') { super(message); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MetricsSourceError();
  return value as Record<string, unknown>;
}
function integer(value: unknown) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new MetricsSourceError(); return value; }
function id(value: unknown) { if (!(typeof value === 'string' && /^\d+$/.test(value)) && !(typeof value === 'number' && Number.isSafeInteger(value) && value > 0)) throw new MetricsSourceError(); return String(value); }
function text(value: unknown) { if (typeof value !== 'string') throw new MetricsSourceError(); return value; }
function rows(value: unknown) { if (!Array.isArray(value)) throw new MetricsSourceError(); return value; }
export function mapMetricsCustomers(value: unknown) {
  const data = record(value);
  return { total: integer(data.total), page: integer(data.page), items: rows(data.items).map(raw => {
    const row = record(raw);
    if (row.role !== 'user') throw new MetricsSourceError('The account service did not apply the customer filter.');
    return { id: id(row.id), username: text(row.username), email: text(row.email), status: text(row.status) } satisfies MetricsCustomer;
  }) };
}
export function mapMetricsTrend(value: unknown, granularity: 'hour' | 'day'): CustomerUsagePoint[] {
  const data = record(value);
  if (data.granularity !== granularity) throw new MetricsSourceError();
  return rows(data.trend).map(raw => {
    const row = record(raw), period = text(row.date);
    if (!(granularity === 'hour' ? /^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):00$/ : /^\d{4}-\d{2}-\d{2}$/).test(period) || !Number.isFinite(Date.parse(period.slice(0, 10))) || new Date(period.slice(0, 10)).toISOString().slice(0, 10) !== period.slice(0, 10)) throw new MetricsSourceError();
    const cost = row.actual_cost;
    if (!['number', 'string'].includes(typeof cost) || !Number.isFinite(Number(cost)) || Number(cost) < 0 || Number(cost) >= 1e15) throw new MetricsSourceError();
    const actualCost = typeof cost === 'number' ? cost.toFixed(12).replace(/\.?0+$/, '') || '0' : String(cost);
    if (!/^\d+(?:\.\d{1,12})?$/.test(actualCost)) throw new MetricsSourceError();
    return { period, userId: id(row.user_id), requests: integer(row.requests), actualCost };
  });
}
export function mapMetricsUsagePage(value: unknown) {
  const data = record(value);
  return rows(data.items).map(raw => {
    const row = record(raw), at = text(row.created_at);
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(at) || !Number.isFinite(Date.parse(at))) throw new MetricsSourceError();
    return { id: id(row.id), userId: id(row.user_id), createdAt: new Date(at).toISOString() };
  });
}
export function mapMetricsTimezone(value: unknown) {
  const timezone = text(record(value).server_timezone);
  try { return new Intl.DateTimeFormat('en', { timeZone: timezone }).resolvedOptions().timeZone; } catch { throw new MetricsSourceError('The account service did not provide a valid reporting timezone.'); }
}
