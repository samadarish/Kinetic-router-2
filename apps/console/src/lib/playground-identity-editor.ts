import { playgroundSettingsUpdateSchema, type PlaygroundModelIdentity, type PlaygroundSettings, type PlaygroundSettingsUpdate } from '@kineticrouter/portal-contract';

export type ModelIdentityDraft = { name: string; knowledgeCutoff: string; invalidCutoff?: boolean };
export type ModelIdentityDrafts = Map<string, ModelIdentityDraft>;

export function identityDrafts(identities: PlaygroundModelIdentity[]): ModelIdentityDrafts {
  return new Map(identities.map(identity => [identity.modelId, { name: identity.name ?? '', knowledgeCutoff: identity.knowledgeCutoff ?? '' }]));
}

export function identityEntries(drafts: ModelIdentityDrafts): PlaygroundModelIdentity[] {
  return [...drafts].flatMap(([modelId, draft]) => {
    const name = draft.name.trim(), knowledgeCutoff = draft.knowledgeCutoff.trim();
    return name || knowledgeCutoff ? [{ modelId, ...(name ? { name } : {}), ...(knowledgeCutoff ? { knowledgeCutoff } : {}) }] : [];
  }).sort((a, b) => a.modelId.localeCompare(b.modelId));
}

export function modelIdentitiesChanged(saved: PlaygroundModelIdentity[], drafts: ModelIdentityDrafts): boolean {
  return [...drafts.values()].some(draft => draft.invalidCutoff) || JSON.stringify(identityEntries(identityDrafts(saved))) !== JSON.stringify(identityEntries(drafts));
}

export function preparePlaygroundSettings(settings: PlaygroundSettings, enabled: Set<string>, drafts: ModelIdentityDrafts, playgroundEnabled = settings.playgroundEnabled): PlaygroundSettingsUpdate {
  // Native month inputs expose an empty value while partially entered. Keep
  // their invalid state when a row is filtered out instead of treating it as clear.
  const invalidCutoff = [...drafts].find(([, draft]) => draft.invalidCutoff);
  if (invalidCutoff) throw new Error(`${invalidCutoff[0]}: enter a complete month and year or use Clear identity.`);
  const result = playgroundSettingsUpdateSchema.safeParse({ revision: settings.revision, playgroundEnabled, enabledModelIds: [...enabled].sort(), modelIdentities: identityEntries(drafts) });
  if (!result.success) {
    const issue = result.error.issues[0];
    const index = issue?.path[0] === 'modelIdentities' && typeof issue.path[1] === 'number' ? issue.path[1] : undefined;
    const model = index === undefined ? undefined : identityEntries(drafts)[index]?.modelId;
    throw new Error(`${model ? `${model}: ` : ''}${issue?.message ?? 'Check the model identity settings.'}`);
  }
  if (new TextEncoder().encode(JSON.stringify(result.data)).byteLength > 128 * 1024) throw new Error('These settings exceed the save limit. Shorten identity names or remove unused identities before saving.');
  return result.data;
}
