import { describe, expect, it } from 'vitest';
import { PortalApiError } from './api';
import { shouldRetryQuery } from './query-policy';

function responseError(status: number) {
  return new PortalApiError({ status, code: `HTTP_${status}`, message: 'The operation failed.' });
}

describe('console read retry policy', () => {
  it.each([400, 401, 403, 404, 409, 422, 429])('never retries HTTP %s even with generic error copy', (status) => {
    expect(shouldRetryQuery(0, responseError(status))).toBe(false);
  });

  it.each([0, 500, 502, 503, 504])('retries a transient HTTP %s failure at most once', (status) => {
    expect(shouldRetryQuery(0, responseError(status))).toBe(true);
    expect(shouldRetryQuery(1, responseError(status))).toBe(false);
  });

  it('does not retry deliberate cancellation or programming failures', () => {
    expect(shouldRetryQuery(0, new DOMException('Cancelled', 'AbortError'))).toBe(false);
    expect(shouldRetryQuery(0, new Error('Render failed'))).toBe(false);
    expect(shouldRetryQuery(0, new RangeError('Invalid range'))).toBe(false);
  });

  it('allows one retry for a timeout or network failure', () => {
    expect(shouldRetryQuery(0, new DOMException('Timed out', 'TimeoutError'))).toBe(true);
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetryQuery(1, new TypeError('Failed to fetch'))).toBe(false);
  });
});
