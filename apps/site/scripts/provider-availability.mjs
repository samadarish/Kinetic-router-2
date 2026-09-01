import { readFile } from 'node:fs/promises';

export const providerAvailability = JSON.parse(
  await readFile(new URL('../../../packages/platform-config/src/provider-registry.json', import.meta.url), 'utf8'),
);

const normalizeProvider = (value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function providerForAlias(value) {
  if (!value) return undefined;
  const normalized = normalizeProvider(value);
  return Object.entries(providerAvailability.providers).find(([id, provider]) =>
    id === normalized || provider.aliases.some((alias) => normalizeProvider(alias) === normalized),
  )?.[1];
}

export function documentationRuleStatus(rule, fallback) {
  return rule?.provider ? providerForAlias(rule.provider)?.apiState ?? fallback : rule?.status ?? fallback;
}

export function documentationRouteStatus(route, statusConfig) {
  const rule = statusConfig.rules.find((item) => item.route === route)
    ?? statusConfig.rules.find((item) => item.prefix && route.startsWith(item.prefix));
  return documentationRuleStatus(rule, statusConfig.default.status);
}
