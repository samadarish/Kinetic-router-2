import type { ApiKey, Group } from '@kineticrouter/portal-contract';

export function apiKeyGroupLabel(key: Pick<ApiKey, 'groupId' | 'group'>): string {
  if (!key.groupId) return 'No group assigned';
  return key.group?.name || `Group #${key.groupId}`;
}

export function isKeyGroupSelectionValid(groupId: string, groups: ReadonlyArray<Pick<Group, 'id'>>, currentGroupId?: string | null): boolean {
  return Boolean(groupId) && (groupId === currentGroupId || groups.some(group => group.id === groupId));
}

export function keyGroupPayload(groupId: string, groups: ReadonlyArray<Pick<Group, 'id'>>, currentGroupId?: string | null): { groupId?: string } {
  if (!isKeyGroupSelectionValid(groupId, groups, currentGroupId)) throw new Error('Select an available group for this API key.');
  // Omitting an unchanged assignment also preserves groups no longer available for new keys.
  return groupId === currentGroupId ? {} : { groupId };
}
