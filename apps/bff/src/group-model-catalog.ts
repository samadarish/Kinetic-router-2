import type { Group, GroupModelCatalog, PlaygroundSettings } from '@kineticrouter/portal-contract';
import { resolveGroupProvider, resolveModelProvider } from '@kineticrouter/platform-config/provider-resolution';

/** The caller supplies only groups returned by the authenticated user's API. */
export function groupModelCatalog(groups: readonly Group[], settings: Pick<PlaygroundSettings, 'revision' | 'enabledModelIds'>): GroupModelCatalog {
  const models = settings.enabledModelIds.map(id => ({ id, provider: resolveModelProvider(id) }));
  return {
    revision: settings.revision,
    groups: groups.map(group => {
      const provider = resolveGroupProvider(group);
      return {
        groupId: group.id,
        provider,
        models: provider === 'unknown' ? [] : models.filter(model => model.provider === provider).map(model => model.id).sort((a, b) => a.localeCompare(b, 'en')),
      };
    }),
  };
}
