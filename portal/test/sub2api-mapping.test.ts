import { describe, expect, it } from 'vitest';
import {
  mapApiKey,
  mapDashboardStats,
  mapPaginated,
  mapUsageEndpoints,
  mapUsageGroups,
  mapUsageModels,
  mapUsageRangeStats,
  mapUsageTrend,
  readCapabilities,
} from '@kineticrouter/sub2api-client';

describe('Sub2API compatibility mapping', () => {
  it('retains the copyable key while producing a masked display value', () => {
    const key = mapApiKey({ id: 7, name: 'Production', key: 'sk-kinetic-1234567890', status: 'active' });
    expect(key.id).toBe('7');
    expect(key.key).toBe('sk-kinetic-1234567890');
    expect(key.maskedKey).not.toContain('1234567890');
    expect(JSON.stringify(key)).toContain('sk-kinetic-1234567890');
  });

  it('normalizes Sub2API zero quota to the unlimited portal state', () => {
    expect(mapApiKey({ id: 1, key: 'secret', status: 'active', quota: 0, quota_used: '4.2' }).quota).toBeNull();
    expect(mapApiKey({ id: 2, key: 'secret', status: 'active', quota: '25.50' }).quota).toBe('25.50');
    expect(mapApiKey({ id: 3, key: 'secret', status: 'active', quota: 'Infinity' }).quota).toBeNull();
  });

  it('normalizes paginated snake-case values', () => {
    const result = mapPaginated({ items: [{ id: 1, key: 'secret', status: 'active' }], total: 21, page: 2, page_size: 10, pages: 3 }, mapApiKey);
    expect(result).toMatchObject({ total: 21, page: 2, pageSize: 10, pages: 3 });
  });

  it('maps dashboard numeric values without currency precision loss in strings', () => {
    const result = mapDashboardStats({
      today_actual_cost: '0.00012345',
      total_tokens: 987654,
      rpm: 3,
      tpm: 456,
      today_cache_read_tokens: 125,
      today_cache_creation_tokens: '25',
      total_cache_read_tokens: 1024,
      total_cache_creation_tokens: '256',
    });
    expect(result.todayActualCost).toBe('0.00012345');
    expect(result.totalTokens).toBe(987654);
    expect(result.rpm).toBe(3);
    expect(result.tpm).toBe(456);
    expect(result.todayCacheReadTokens).toBe(125);
    expect(result.todayCacheCreationTokens).toBe(25);
    expect(result.totalCacheReadTokens).toBe(1024);
    expect(result.totalCacheCreationTokens).toBe(256);
  });

  it('combines runtime capabilities with independently controlled write gates', () => {
    const result = readCapabilities({ channel_monitor_enabled: true, promo_code_enabled: true, payment_enabled: false }, { keys: true, profile: false, redeem: false });
    expect(result).toMatchObject({ channelMonitor: true, promoCode: true, payments: false, keyWrites: true, profileWrites: false });
  });

  it('maps range totals with unambiguous cost fields and the Sub2API cache formula', () => {
    const result = mapUsageRangeStats({
      total_requests: 17,
      total_input_tokens: 100,
      total_output_tokens: 75,
      total_cache_read_tokens: 300,
      total_cache_creation_tokens: 100,
      total_tokens: 575,
      total_cost: '3.123456789',
      total_actual_cost: '1.234567891',
      average_duration_ms: 912,
    });
    expect(result).toMatchObject({
      totalRequests: 17,
      standardCost: '3.123456789',
      actualCost: '1.234567891',
      cacheHitRate: 60,
    });
  });

  it('maps the complete token trend and returns zero cache rate without eligible input', () => {
    const [first, second] = mapUsageTrend({ trend: [
      { date: '2026-08-30 13:00', requests: 2, input_tokens: 100, output_tokens: 50, cache_creation_tokens: 25, cache_read_tokens: 75, total_tokens: 250, cost: '0.4', actual_cost: '0.2' },
      { date: '2026-08-30 14:00', requests: 0, input_tokens: 0, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0, total_tokens: 0, cost: '0', actual_cost: '0' },
    ] });
    expect(first).toMatchObject({ inputTokens: 100, outputTokens: 50, cacheCreationTokens: 25, cacheReadTokens: 75, standardCost: '0.4', actualCost: '0.2', cacheHitRate: 37.5 });
    expect(second?.cacheHitRate).toBe(0);
  });

  it('maps exact model, group, and endpoint aggregate rows', () => {
    expect(mapUsageModels({ models: [{ model: 'gpt-5.6-sol', requests: 4, input_tokens: 10, output_tokens: 20, cache_creation_tokens: 3, cache_read_tokens: 7, total_tokens: 40, cost: '0.09', actual_cost: '0.04' }] })[0]).toMatchObject({ model: 'gpt-5.6-sol', totalTokens: 40, standardCost: '0.09', actualCost: '0.04' });
    expect(mapUsageGroups({ groups: [{ group_id: 9, group_name: 'OpenAI', requests: 4, total_tokens: 40, cost: '0.09', actual_cost: '0.04' }] })[0]).toMatchObject({ groupId: '9', groupName: 'OpenAI' });
    expect(mapUsageEndpoints({ endpoints: [{ endpoint: '/v1/responses', requests: 4, total_tokens: 40, cost: '0.09', actual_cost: '0.04' }] })[0]).toMatchObject({ endpoint: '/v1/responses', totalTokens: 40 });
    expect(mapUsageEndpoints({ endpoints: [{ endpoint: '/v1/images/generations', requests: 1, total_tokens: 257, cost: '0.2', actual_cost: '0.2' }] })[0]?.endpoint).toBe('/v1/images/generations');
    expect(mapUsageGroups({})).toEqual([]);
    expect(mapUsageEndpoints({})).toEqual([]);
  });
});
