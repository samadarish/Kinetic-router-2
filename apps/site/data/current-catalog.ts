import {
  catalogPriceMultiplier, catalogVerifiedAt, modelPriceProfiles,
  openAICompatibleExamples, publicModelChoices, publicModelDefinitions,
} from '@kineticrouter/platform-config/models';
import { getProviderDisplayStatus } from '@kineticrouter/platform-config/providers';
import { OPENAI_API_BASE_URL } from '@kineticrouter/platform-config/origins';
import type { Model, ModelPrice } from './model-utils';

// The immutable imported archive stays separate from the current public offer.
export const currentModels: Model[] = publicModelChoices.map((choice, index) => {
  const definition = publicModelDefinitions[index];
  const profile = modelPriceProfiles[definition.pricingProfile];
  const provider = getProviderDisplayStatus(choice.provider);
  const prices: ModelPrice[] = profile.prices.flatMap((price, priceIndex) => (['official', 'sell'] as const).map((role, roleIndex) => ({
    id: 10_000 + index * 100 + priceIndex * 2 + roleIndex,
    modelId: choice.id, role, billingMode: 'token', component: price.component,
    unit: price.unit, tierLabel: price.tierLabel,
    priceMicroUsd: Math.round(price.usd * 1_000_000) * (role === 'sell' ? catalogPriceMultiplier : 1),
    source: role === 'sell' ? 'kineticrouter_display_offer' : 'official_standard_reference',
    sourceRef: profile.sourceUrl, version: 1, active: true,
  })));
  const examples = openAICompatibleExamples(choice.id, OPENAI_API_BASE_URL);
  const referenceNote = profile.referenceModel && profile.referenceModel !== choice.slug
    ? `Variant pricing uses the official ${profile.referenceModel} base-model rates.` : '';
  const capabilityFlags = [
    ...(profile.inputModalities.includes('image') ? ['vision'] : []),
    ...(profile.prices.some((price) => price.component === 'cache_read') ? ['cache'] : []),
    ...(profile.outputModalities.includes('image') ? ['image'] : []),
  ];
  return {
    ...choice, name: `${provider.label}: ${choice.name}`, upstreamModelId: profile.referenceModel ?? choice.slug,
    aliases: [choice.slug], category: profile.outputModalities.includes('image') ? 'image' : 'chat',
    contextWindow: profile.contextWindow, upstreamContextWindow: profile.contextWindow || undefined,
    maxOutput: profile.maxOutput, upstreamMaxOutput: profile.maxOutput || undefined,
    supportsFast: false, billingMode: 'token', prices, tags: capabilityFlags, free: false, enabled: true,
    tagline: definition.tagline, introMd: definition.tagline, capabilities: capabilityFlags, capabilityFlags,
    faq: [{ q: 'How do I call this model?', kind: 'api_access', a: `Use ${choice.id} with the OpenAI-compatible ${OPENAI_API_BASE_URL} base URL and your kineticRouter API key.` }],
    codeExamples: (['python', 'node', 'curl'] as const).map((language) => ({ language, label: { python: 'Python', node: 'Node.js', curl: 'cURL' }[language], code: examples[language], source: 'kineticrouter' })),
    date: profile.releasedAt ?? '', compatIcons: ['OpenAI'], toolTags: [], hostedOn: 'kineticRouter', hostedOnOptions: ['kineticRouter'],
    family: choice.provider, inputModalities: profile.inputModalities, outputModalities: profile.outputModalities,
    sourceUrl: profile.metadataSourceUrl ?? profile.sourceUrl, sourceVerifiedAt: catalogVerifiedAt, catalogCapturedAt: catalogVerifiedAt,
    availability: provider.modelAccessState,
    pricingNote: [referenceNote, profile.pricingNote].filter(Boolean).join(' '),
  };
});
