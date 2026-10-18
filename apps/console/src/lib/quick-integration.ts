import { activeProviderIds, getProviderDisplayStatus, type ActiveProviderId } from '@kineticrouter/platform-config/providers';
import { defaultProviderModel, openAICompatibleExamples } from '@kineticrouter/platform-config/models';
export const integrationProviderIds = activeProviderIds;
export type IntegrationProviderId = ActiveProviderId;
export const integrationLanguages = ['python', 'node', 'curl'] as const;
export type IntegrationLanguage = typeof integrationLanguages[number];
export const integrationRouteIds = ['direct', 'cloudflare'] as const;
export type IntegrationRouteId = typeof integrationRouteIds[number];
export const integrationRoutes = {
  direct: { label: 'Direct API', origin: 'https://api.kineticrouter.com', baseUrl: 'https://api.kineticrouter.com/v1' },
  cloudflare: { label: 'Cloudflare CDN', origin: 'https://cdn-api.kineticrouter.com', baseUrl: 'https://cdn-api.kineticrouter.com/v1' },
} as const;
export function getIntegrationProvider(id: IntegrationProviderId) {
  return { ...getProviderDisplayStatus(id), model: defaultProviderModel(id).id };
}
export function getIntegrationEndpoint(_providerId: IntegrationProviderId, routeId: IntegrationRouteId) {
  return integrationRoutes[routeId].baseUrl;
}
export function getIntegrationExamples(modelId: string, routeId: IntegrationRouteId) {
  return openAICompatibleExamples(modelId, integrationRoutes[routeId].baseUrl);
}
