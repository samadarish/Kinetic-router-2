import type { DocumentationStatus } from '@/data/documentation';
import { ProviderLogo } from './provider-logo';

const statusClasses: Record<DocumentationStatus['status'], string> = {
  verified: 'docs-status-verified',
  partial: 'docs-status-partial',
  planned: 'docs-status-planned',
  reference: 'docs-status-reference',
};

export function DocsStatusBanner({ status }: { status: DocumentationStatus }) {
  const guide = status.guide;
  return (
    <aside className={`docs-status-banner ${statusClasses[guide ? 'reference' : status.status]}`} aria-label={guide ? 'Documentation provenance' : 'Documentation availability'}>
      <div className="docs-status-heading">
        {status.provider && <ProviderLogo provider={status.provider} className="h-4 w-4" />}
        <strong>{guide ? 'Customer guide' : status.label}</strong>
        {(!guide || status.provider) && <span>{guide ? `${status.label} route` : status.status}</span>}
      </div>
      <p>{status.summary}</p>
      <div className="docs-status-meta">
        <span>{guide ? 'Updated' : 'Checked'} {new Date(`${guide?.updatedAt ?? status.verifiedAt}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
        {guide && status.provider && <span>Route status checked {status.verifiedAt}</span>}
        {status.sources.map((source) => <a key={source} href={source} target="_blank" rel="noreferrer">Source ↗</a>)}
      </div>
    </aside>
  );
}
