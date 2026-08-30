import statusConfig from './documentation-status.json';
import { providerAllowsInteraction, providerAvailabilityCheckedAt, providerDisplayStatus } from './provider-availability';

export type DocumentationStatusKind = 'verified' | 'partial' | 'planned' | 'reference';

export type DocumentationStatus = {
  status: DocumentationStatusKind;
  label: string;
  summary: string;
  verifiedAt: string;
  provider?: 'openai' | 'anthropic' | 'claude' | 'grok';
  sources: string[];
};

type StatusRule = Partial<DocumentationStatus> & { route?: string; prefix?: string };

export const catalogSnapshot = statusConfig.snapshot;

export function documentationStatusFor(route: string): DocumentationStatus {
  const rules = statusConfig.rules as StatusRule[];
  const matched = rules.find((rule) => rule.route === route) ?? rules.find((rule) => rule.prefix && route.startsWith(rule.prefix));
  const value = matched ?? (statusConfig.default as DocumentationStatus);
  const provider = value.provider ? providerDisplayStatus(value.provider) : undefined;
  return {
    status: provider?.apiState ?? value.status ?? 'reference',
    label: provider?.badgeLabel ?? value.label ?? 'Reference snapshot',
    summary: provider ? [provider.summary, value.summary].filter(Boolean).join(' ') : value.summary ?? statusConfig.default.summary,
    verifiedAt: provider ? providerAvailabilityCheckedAt : value.verifiedAt ?? statusConfig.default.verifiedAt,
    provider: value.provider,
    sources: provider?.protocolSources ?? value.sources ?? [],
  };
}

export function correctMirroredDocumentation(route: string, html: string) {
  let corrected = html
    .replaceAll('/docs/zh/', '/docs/')
    .replaceAll('/docs/develop/advanced/model-routing', '/docs/develop/advanced/provider-routing')
    .replaceAll('Repeated system prompts can save 50-90% on input costs', 'Prompt-cache savings are model-specific; check the current provider and Kinetic Router price records')
    .replaceAll('Repeated prompts can save roughly 50% on input costs', 'Prompt-cache savings are model-specific; check the current provider and Kinetic Router price records')
    .replaceAll('fully compatible', 'compatible with the documented subset')
    .replaceAll('Fully compatible', 'Compatible with the documented subset')
    .replaceAll('100% compatible', 'compatible with the documented subset')
    .replaceAll('live pricing', 'reference snapshot pricing')
    .replaceAll('Live pricing', 'Reference snapshot pricing')
    .replaceAll('current Kinetic Router prices', 'mirrored snapshot prices')
    .replaceAll('No rate limits', 'Account-specific rate limits')
    .replaceAll('No Rate Limits', 'Account-specific rate limits');

  if (route === '/docs/api/grok/responses') {
    const grok = providerDisplayStatus('grok');
    corrected = corrected.replace(
      'It is a Kinetic Router bridge to xAI HTTP/SSE for each turn. It does not indicate that xAI provides a native WebSocket transport.',
      `xAI now provides a native Responses WebSocket transport. ${grok.summary}`,
    );
  }

  if (route === '/docs/integrations/codex/websocket') {
    corrected = corrected
      .replaceAll('Enable WebSocket (Recommended)', 'Configure WebSocket (validation required)')
      .replaceAll('Enable WebSocket in One Command (Recommended)', 'Configure WebSocket in one command (validation required)')
      .replaceAll('The script backs up <code class="nextra-code" dir="ltr">~/.codex/config.toml</code>, finds the Kinetic Router provider written by CC Switch when possible, and adds these fields to the existing provider block.', 'The Kinetic Router helper creates a provider config only when no existing Codex config is present. It exits without modifying an existing config so you can review changes manually.')
      .replaceAll('Together, they let Codex connect to Kinetic Router through the recommended path.', 'Together, they request the Responses format and WebSocket transport. Confirm both behaviors with your account before relying on them.')
      .replaceAll('This command only enables the Codex protocol format and WebSocket connection.', 'This configuration requests the Codex Responses format and WebSocket connection; runtime support remains account-tested.');
  }

  if (route === '/docs/develop/observability/pricing') {
    corrected = corrected
      .replaceAll('No subscriptions, no plans, no monthly fees, no minimum spend.', 'Billing and subscription availability is controlled by the current Kinetic Router account configuration.')
      .replaceAll('No subscriptions, no plans, no hidden fees. Top up and start using immediately. Balance never expires.', 'Review the customer portal for the billing methods, subscriptions, and balance behavior enabled for your account.')
      .replaceAll('For real-time pricing of each model', 'For the dated reference pricing for each model');
  }

  const status = documentationStatusFor(route);
  corrected = corrected.replace(/<pre\b[\s\S]*?<\/pre>/gi, (block) => {
    const blockProvider = /api\.kineticrouter\.com\/anthropic|anthropic\/claude/i.test(block)
      ? 'anthropic'
      : /api\.kineticrouter\.com\/grok|grok\/grok/i.test(block)
        ? 'grok'
        : undefined;
    const plannedProviderExample = blockProvider
      ? !providerAllowsInteraction(blockProvider)
      : status.status === 'planned';
    if (!plannedProviderExample) return block;
    const provider = blockProvider ? providerDisplayStatus(blockProvider) : undefined;
    return `<div class="docs-pending-example"><strong>${provider?.badgeLabel ?? status.label} example</strong><p>${provider?.summary ?? status.summary} This example is intentionally not copyable in its current display state.</p></div>`;
  });

  return corrected;
}
