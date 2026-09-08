import { describe, expect, it } from 'vitest';
import { keyQuota, pageAfterKeyDeletion } from './key-quota';

describe('API key quota presentation', () => {
  it.each([
    ['0', 0], ['25', 25], ['100', 100], ['125.1234', 100],
  ])('shows %s of a 100 USD limit without changing the used amount', (used, percent) => {
    expect(keyQuota('100', used)).toEqual({ kind: 'limited', limit: 100, used: Number(used), percent });
  });

  it.each([null, '0', '0.0000'])('recognizes upstream unlimited quota %s', (quota) => {
    expect(keyQuota(quota, '12.5')).toEqual({ kind: 'unlimited', used: 12.5 });
  });

  it.each([undefined, '', 'invalid', '-1', 'Infinity'])('does not invent an unlimited quota from %s', (quota) => {
    expect(keyQuota(quota, '3')).toEqual({ kind: 'unknown', used: 3 });
  });

  it.each([undefined, null, '', 'invalid', '-1', 'Infinity'])('keeps missing or invalid used amount %s unknown', (used) => {
    expect(keyQuota('100', used)).toEqual({ kind: 'limited', limit: 100, used: undefined, percent: undefined });
  });

  it('returns to the previous page only when deleting the last row', () => {
    expect(pageAfterKeyDeletion(2, 1)).toBe(1);
    expect(pageAfterKeyDeletion(1, 1)).toBe(1);
    expect(pageAfterKeyDeletion(2, 4)).toBe(2);
  });
});
