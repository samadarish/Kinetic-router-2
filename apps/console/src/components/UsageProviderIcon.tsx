import { IntegrationProviderIcon } from './IntegrationIcons';
import { ProviderIcon } from './ProviderIcon';

export function UsageProviderIcon({ model, size = 16 }: { model: string; size?: number }) {
  const name = model.normalize('NFKC').trim().toLowerCase().replace(/^@/, '').replace(/^models?[/.:_-]+/, '');

  if (/^deepseek(?:[\s/_.:-]|$)/.test(name)) {
    return <IntegrationProviderIcon provider="deepseek" size={size} />;
  }
  if (/^(?:zhipu|z[\s._-]*ai|(?:chat)?glm)(?:[\s/_.:-]|$)/.test(name)) {
    return <IntegrationProviderIcon provider="zhipu" size={size} />;
  }
  if (/^(?:moonshot(?:[\s._-]*ai)?|kimi)(?:[\s/_.:-]|$)/.test(name)) {
    return <IntegrationProviderIcon provider="moonshot" size={size} />;
  }

  return <ProviderIcon model={model} size={size} />;
}
