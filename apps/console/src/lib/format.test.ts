import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatNumber, formatOptionalMoney } from './format';

describe('shared customer formatters', () => {
  it('preserves micro-prices and normal currency formatting when reused', () => {
    expect(formatMoney('0.000321', 6)).toBe('$0.000321');
    expect(formatMoney('12.5')).toBe('$12.50');
    expect(formatMoney('0.000123', 6)).toBe('$0.000123');
    expect(formatMoney('1200.75')).toBe('$1,200.75');
  });

  it('keeps unknown optional costs distinct from a zero charge', () => {
    expect(formatOptionalMoney(undefined)).toBe('—');
    expect(formatOptionalMoney(null)).toBe('—');
    expect(formatOptionalMoney('invalid')).toBe('—');
    expect(formatOptionalMoney('0')).toBe('$0.00');
  });

  it('retains number thresholds and invalid-date fallback', () => {
    expect(formatNumber(1500)).toBe('1,500');
    expect(formatNumber(1_500_000)).toBe('1.5M');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('unavailable')).toBe('unavailable');
  });
});
