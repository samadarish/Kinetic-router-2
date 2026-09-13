import { describe, expect, it } from 'vitest';
import { apiKeyGroupLabel, isKeyGroupSelectionValid, keyGroupPayload } from './api-key-group';

const groups = [{ id: '7', name: 'OpenAI' }, { id: '12', name: 'Anthropic' }];

describe('API key group selection', () => {
  it.each([undefined, null])('requires an explicit available group when the current group is %s', currentGroupId => {
    expect(isKeyGroupSelectionValid('', groups, currentGroupId)).toBe(false);
    expect(() => keyGroupPayload('', groups, currentGroupId)).toThrow('Select an available group');
    expect(keyGroupPayload('7', groups, currentGroupId)).toEqual({ groupId: '7' });
  });

  it('rejects unknown selections even when another group is available', () => {
    expect(() => keyGroupPayload('99', groups)).toThrow('Select an available group');
    expect(() => keyGroupPayload('99', groups, '42')).toThrow('Select an available group');
    expect(() => keyGroupPayload('7', [])).toThrow('Select an available group');
  });

  it('preserves an unchanged assignment even when it is no longer available', () => {
    expect(isKeyGroupSelectionValid('42', groups, '42')).toBe(true);
    expect(keyGroupPayload('42', groups, '42')).toEqual({});
    expect(keyGroupPayload('42', [], '42')).toEqual({});
    expect(keyGroupPayload('7', groups, '7')).toEqual({});
    expect(keyGroupPayload('12', groups, '42')).toEqual({ groupId: '12' });
  });

  it('does not interpret a blank edit selection as keeping an assigned group', () => {
    expect(() => keyGroupPayload('', groups, '42')).toThrow('Select an available group');
  });
});

describe('API key group labels', () => {
  it.each([undefined, null, ''])('labels a missing group ID %s as unassigned', groupId => {
    expect(apiKeyGroupLabel({ groupId })).toBe('No group assigned');
    expect(apiKeyGroupLabel({ groupId, group: { id: '7', name: 'Unexpected details' } })).toBe('No group assigned');
  });

  it('distinguishes missing group details from an unassigned key', () => {
    expect(apiKeyGroupLabel({ groupId: '42', group: null })).toBe('Group #42');
    expect(apiKeyGroupLabel({ groupId: '42', group: { id: '42', name: '' } })).toBe('Group #42');
    expect(apiKeyGroupLabel({ groupId: '7', group: { id: '7', name: 'Default' } })).toBe('Default');
  });
});
