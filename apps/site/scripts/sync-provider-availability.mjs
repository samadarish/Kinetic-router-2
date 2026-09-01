import { providerAvailability } from './provider-availability.mjs';

const ids = Object.keys(providerAvailability.providers ?? {}).sort();
if (providerAvailability.version !== 1 || providerAvailability.displayOnly !== true || ids.join(',') !== 'anthropic,grok,openai') {
  console.error('The canonical provider registry is invalid.');
  process.exit(1);
}

console.log('Canonical provider availability registry is valid; no generated copy is required.');
