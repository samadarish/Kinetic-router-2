import { catalogSnapshot } from '@/data/documentation';
import { ProviderLogo } from './provider-logo';

export function CatalogNotice({ compact = false, capturedAt, supplement }: { compact?: boolean; capturedAt?: string; supplement?: string }) {
  return (
    <aside className={`catalog-notice ${compact ? 'catalog-notice-compact' : ''}`} aria-label="Catalog data source">
      <div className="catalog-provider-icons" aria-hidden="true">
        <ProviderLogo provider="openai" className="h-4 w-4" />
        <ProviderLogo provider="anthropic" className="h-4 w-4" />
        <ProviderLogo provider="grok" className="h-4 w-4" />
      </div>
      <div>
        <strong>Reference catalog snapshot</strong>
        <p>{catalogSnapshot.notice} Captured {capturedAt ?? catalogSnapshot.capturedAt}.{supplement ? ` ${supplement}` : ''}</p>
      </div>
      <a href="/docs" className="catalog-notice-link">Verification details</a>
    </aside>
  );
}
