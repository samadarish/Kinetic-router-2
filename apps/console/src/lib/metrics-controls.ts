import type { MetricsQuery } from '@kineticrouter/portal-contract';
import type { UsageDateRange } from '../components/UsageDateRangePicker';

export type MetricsView = 'usage' | 'customers' | 'activity';
export type ChartMetric = 'users' | 'requests' | 'actualCost';
type ReportDates = { range: UsageDateRange; allTime: boolean; page: number; refresh: number };
export type MetricsControls = {
  view: MetricsView;
  usage: { scope: 'today' | 'all-time'; metric: 'requests' | 'actualCost'; refresh: number };
  customers: ReportDates & { cohort: MetricsQuery['cohort']; input: string };
  activity: ReportDates & { source: 'api' | 'console'; metric: ChartMetric };
};
export const initialMetricsControls = (range: UsageDateRange): MetricsControls => ({
  view: 'usage', usage: { scope: 'today', metric: 'actualCost', refresh: 0 },
  customers: { range, allTime: false, page: 1, refresh: 0, cohort: 'all', input: '' },
  activity: { range, allTime: false, page: 1, refresh: 0, source: 'api', metric: 'users' },
});
type Action =
  | { type: 'view'; view: MetricsView }
  | { type: 'usage'; scope: MetricsControls['usage']['scope'] }
  | { type: 'dates'; view: 'customers' | 'activity'; range?: UsageDateRange }
  | { type: 'timezone'; range: UsageDateRange }
  | { type: 'page'; view: 'customers' | 'activity'; page: number }
  | { type: 'customerFilters'; cohort?: MetricsQuery['cohort']; input?: string }
  | { type: 'source'; source: 'api' | 'console' }
  | { type: 'usageMetric'; metric: 'requests' | 'actualCost' }
  | { type: 'activityMetric'; metric: ChartMetric }
  | { type: 'refresh'; view: MetricsView; generation: number };
export function metricsControlsReducer(state: MetricsControls, action: Action): MetricsControls {
  switch (action.type) {
    case 'view': return { ...state, view: action.view };
    case 'usage': return { ...state, usage: { ...state.usage, scope: action.scope } };
    case 'dates': return { ...state, [action.view]: { ...state[action.view], range: action.range ?? state[action.view].range, allTime: !action.range, page: 1 } };
    case 'timezone': return { ...state, customers: { ...state.customers, range: action.range, allTime: false, page: 1 }, activity: { ...state.activity, range: action.range, allTime: false, page: 1 } };
    case 'page': return { ...state, [action.view]: { ...state[action.view], page: action.page } };
    case 'customerFilters': return { ...state, customers: { ...state.customers, cohort: action.cohort ?? state.customers.cohort, input: action.input ?? state.customers.input, page: 1 } };
    case 'source': return { ...state, activity: { ...state.activity, source: action.source, page: 1 } };
    case 'usageMetric': return { ...state, usage: { ...state.usage, metric: action.metric } };
    case 'activityMetric': return { ...state, activity: { ...state.activity, metric: action.metric } };
    case 'refresh': return { ...state, [action.view]: { ...state[action.view], refresh: action.generation } };
  }
}
export function metricsReportParams(dates: ReportDates): Record<string, string | number> {
  return { ...(dates.allTime ? { range: 'all-time' } : { startDate: dates.range.startDate, endDate: dates.range.endDate }), refresh: dates.refresh };
}
