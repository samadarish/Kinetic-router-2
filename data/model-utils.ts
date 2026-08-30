export type ModelPrice = {
  id: number; modelId: string; role: 'official' | 'sell'; billingMode: string; component: string; unit: string; tierLabel: string; priceMicroUsd: number; source: string; sourceRef?: string; version: number; active: boolean;
};
export type ModelFaq = { q: string; a: string; kind: string };
export type CodeExample = { language: string; label: string; code: string; source: string };
export type Model = {
  id: string; slug: string; provider: 'openai' | 'anthropic' | 'grok'; upstreamModelId?: string; aliases: string[]; name: string; category: string; contextWindow: number; supportsFast: boolean; billingMode: string; prices: ModelPrice[]; tags: string[]; free: boolean; enabled: boolean; tagline: string; introMd: string; capabilities: string[]; faq: ModelFaq[]; codeExamples: CodeExample[]; maxOutput: number; date: string; compatIcons: string[]; toolTags: string[]; hostedOn: string; hostedOnOptions: string[]; family: string; capabilityFlags: string[]; inputModalities: string[]; outputModalities: string[];
  upstreamContextWindow?: number; upstreamMaxOutput?: number; gatewayMaxInput?: number; gatewayMaxOutput?: number; sourceUrl?: string; sourceVerifiedAt?: string; availability?: 'reference' | 'partial' | 'planned' | 'verified';
};

export function priceFor(model: Model, role: 'sell' | 'official', component: string) { return model.prices.find((price) => price.active && price.role === role && price.component === component && !price.tierLabel); }
export function usdPrice(model: Model, role: 'sell' | 'official', component: string) { const price = priceFor(model, role, component); return price ? price.priceMicroUsd / 1_000_000 : undefined; }
export function discountRate(model: Model) { const sell = usdPrice(model, 'sell', 'input'); const official = usdPrice(model, 'official', 'input'); if (sell == null || official == null || official === 0) return undefined; return sell / official; }
export function formatUsd(value: number | undefined) {
  if (value == null) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 })}/M`;
}
export function formatTokens(value: number) { if (value >= 1_000_000) return `${value / 1_000_000}M`; if (value >= 1_000) return `${Math.round(value / 1_000)}K`; return String(value); }
export function displayContextWindow(model: Model) { return model.upstreamContextWindow ?? model.contextWindow; }
