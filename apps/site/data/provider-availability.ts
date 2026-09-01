import {
  displayStateLabel,
  getProviderDisplayStatus,
  providerAllowsInteraction as sharedProviderAllowsInteraction,
  providerDisplayRegistry,
  resolveProviderDisplayId,
} from '@kineticrouter/platform-config/providers';
import type {
  ProviderDisplayId,
  ProviderDisplayState,
  ProviderDisplayStatus,
  ProviderInteractionMode,
} from '@kineticrouter/platform-config/providers';

export type ProviderId = ProviderDisplayId;
export type { ProviderDisplayState, ProviderDisplayStatus, ProviderInteractionMode };
export const providerAvailabilityConfig = providerDisplayRegistry;
export const providerAvailability = providerDisplayRegistry.providers;
export const providerAvailabilityCheckedAt = providerDisplayRegistry.checkedAt;
export const resolveProviderId = resolveProviderDisplayId;
export function providerDisplayStatus(value: string) { return getProviderDisplayStatus(value); }
export function providerAllowsInteraction(value: string) { return sharedProviderAllowsInteraction(value); }
export { displayStateLabel };
