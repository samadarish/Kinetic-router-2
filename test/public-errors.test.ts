import { describe, expect, it } from 'vitest';
import { toPublicErrorCode, toPublicText, toPublicUpstreamMessage } from '../apps/bff/src/public-errors';

describe('public account-service messages', () => {
  it.each([
    'rateMultiplier', 'rate_multiplier', 'userRateMultiplier', 'user_rate_multiplier',
    'resolvedRateMultiplier', 'resolved_rate_multiplier', 'effectiveRateMultiplier', 'effective_rate_multiplier',
    'standardCost', 'standard_cost', 'totalCost', 'total_cost',
  ])('does not expose %s in upstream diagnostic strings or codes', field => {
    expect(toPublicUpstreamMessage(`Invalid request: {"${field}":0.25}`, 400)).toBe('The request could not be completed.');
    expect(toPublicText(`Account detail ${field}=0.25`, '')).toBe('');
    expect(toPublicErrorCode(`${field}_INVALID`, 400)).toBe('REQUEST_FAILED');
  });

  it('removes the internal product name from user-facing text', () => {
    expect(toPublicText('Sub2API account updated.', 'Updated.')).toBe('kineticRouter account updated.');
    expect(toPublicText('Hao.ai reference', 'Reference')).toBe('kineticRouter reference');
    expect(toPublicText('NewAPI notice', 'Notice')).toBe('kineticRouter notice');
    expect(toPublicText('Create a new API key.', 'Create a key.')).toBe('Create a new API key.');
  });

  it('hides implementation details while keeping useful validation errors', () => {
    expect(toPublicUpstreamMessage('Invalid request: json: cannot unmarshal string into Go struct field group_id', 400))
      .toBe('The submitted information is invalid. Check the fields and try again.');
    expect(toPublicUpstreamMessage('redeem code not found', 404)).toBe('redeem code not found');
  });

  it('never exposes upstream infrastructure failures or internal error codes', () => {
    expect(toPublicUpstreamMessage('dial tcp 10.0.0.5:5432: connection refused', 502))
      .toBe('The account service could not complete the request.');
    expect(toPublicErrorCode('SUB2API_DATABASE_ERROR', 500)).toBe('ACCOUNT_SERVICE_UNAVAILABLE');
    expect(toPublicErrorCode('SUB2API_INVALID_CODE', 400)).toBe('REQUEST_FAILED');
    expect(toPublicErrorCode('REDEEM_CODE_NOT_FOUND', 404)).toBe('REDEEM_CODE_NOT_FOUND');
    expect(toPublicUpstreamMessage('dial tcp 10.0.0.5:5432: connection refused', 0))
      .toBe('The request could not be completed.');
    expect(toPublicUpstreamMessage('dial tcp 10.0.0.5:5432: connection refused', 400))
      .toBe('The submitted information is invalid. Check the fields and try again.');
  });
});
