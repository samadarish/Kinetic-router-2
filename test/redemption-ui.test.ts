import { describe, expect, it } from 'vitest';
import { formatRedemptionValue, normalizeRedemptionCode } from '../apps/console/src/pages/RedeemPage';

describe('redemption UI helpers', () => {
  it('preserves code casing while trimming accidental whitespace', () => {
    expect(normalizeRedemptionCode('  test-Code_2  ')).toBe('test-Code_2');
  });

  it('formats each reward according to its type', () => {
    expect(formatRedemptionValue('balance', '12.5')).toBe('$12.50');
    expect(formatRedemptionValue('concurrency', '3')).toBe('3 concurrent requests');
    expect(formatRedemptionValue('subscription', '0', 30)).toBe('30 days');
  });
});
