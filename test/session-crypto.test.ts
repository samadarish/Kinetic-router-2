import { describe, expect, it } from 'vitest';
import { constantTimeEqual, decryptJson, encryptJson } from '../apps/bff/src/crypto';

describe('portal session encryption', () => {
  const secret = 'a-test-secret-that-is-longer-than-thirty-two-characters';

  it('encrypts token data with authenticated encryption', () => {
    const value = { accessToken: 'access-secret', refreshToken: 'refresh-secret', userId: '42' };
    const encrypted = encryptJson(value, secret);
    expect(encrypted).not.toContain('access-secret');
    expect(decryptJson<typeof value>(encrypted, secret)).toEqual(value);
  });

  it('rejects tampering', () => {
    const encrypted = encryptJson({ ok: true }, secret);
    expect(() => decryptJson(`${encrypted.slice(0, -2)}aa`, secret)).toThrow();
  });

  it('compares CSRF tokens without prefix acceptance', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false);
    expect(constantTimeEqual('abc123', 'abc1234')).toBe(false);
  });
});
