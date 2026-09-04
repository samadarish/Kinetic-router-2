import { describe, expect, it } from 'vitest';
import { createApiKeySchema, updateApiKeySchema } from '@kineticrouter/portal-contract';
import { toCreateKeyBody, toUpdateKeyBody } from '../apps/bff/src/api-key-payload';

describe('Sub2API key request payloads', () => {
  it('converts the portal group ID to the numeric value required by Sub2API', () => {
    const input = createApiKeySchema.parse({ name: 'Production', groupId: '12' });

    expect(toCreateKeyBody(input)).toEqual({ name: 'Production', group_id: 12 });
  });

  it('keeps optional create controls out of the request when they are disabled', () => {
    const input = createApiKeySchema.parse({
      name: 'Production',
      groupId: null,
      ipWhitelist: [],
      ipBlacklist: [],
      quota: null,
      expiresInDays: null,
      rateLimit5h: null,
      rateLimit1d: null,
      rateLimit7d: null,
    });

    expect(toCreateKeyBody(input)).toEqual({ name: 'Production' });
  });

  it('converts update group IDs and omits null because Sub2API cannot clear a group with null', () => {
    expect(toUpdateKeyBody(updateApiKeySchema.parse({ groupId: '42' }))).toEqual({ group_id: 42 });
    expect(toUpdateKeyBody(updateApiKeySchema.parse({ groupId: null }))).toEqual({});
  });

  it('uses the upstream empty-string sentinel when an existing expiration is disabled', () => {
    expect(toUpdateKeyBody(updateApiKeySchema.parse({ expiresAt: null }))).toEqual({ expires_at: '' });
  });

  it.each(['not-a-group', '4.2', '1e2', '0', '9007199254740992'])('rejects invalid Sub2API group ID %s', (groupId) => {
    const input = createApiKeySchema.parse({ name: 'Production', groupId });

    expect(() => toCreateKeyBody(input)).toThrow('Choose a valid API key group.');
  });

  it('enforces Sub2API custom-key compatibility rules', () => {
    expect(() => createApiKeySchema.parse({ name: 'Production', groupId: '12', customKey: 'too-short' })).toThrow();
    expect(() => createApiKeySchema.parse({ name: 'Production', groupId: '12', customKey: 'invalid key value' })).toThrow();
    expect(createApiKeySchema.parse({ name: 'Production', groupId: '12', customKey: 'valid_custom-key_123' }).customKey).toBe('valid_custom-key_123');
  });

  it('limits generated API key expiry to ten years', () => {
    expect(createApiKeySchema.parse({ name: 'Production', expiresInDays: 3650 }).expiresInDays).toBe(3650);
    expect(() => createApiKeySchema.parse({ name: 'Production', expiresInDays: 3651 })).toThrow();
  });
});
