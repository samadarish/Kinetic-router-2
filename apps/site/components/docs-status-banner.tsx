import type { DocumentationStatus } from '@/data/documentation';
import { ProviderLogo } from './provider-logo';

const statusClasses: Record<DocumentationStatus['status'], string> = {
  verified: 'docs-status-verified',
  partial: 'docs-status-partial',
  planned: 'docs-status-planned',
  reference: 'docs-status-reference',
};

export function DocsStatusBanner({ status }: { status: DocumentationStatus }) {
  return (
    <aside className={`docs-status-banner ${statusClasses[status.status]}`} aria-label="Documentation availability">
      <div className="docs-status-heading">
        {status.provider && <ProviderLogo provider={status.provider} className="h-4 w-4" />}
        <strong>{status.label}</strong>
        <span>{status.status}</span>
      </div>
      <p>{status.summary}</p>
      <div className="docs-status-meta">
        <span>Checked {new Date(`${status.verifiedAt}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
        {status.sources.map((source) => <a key={source} href={source} target="_blank" rel="noreferrer">Source ↗</a>)}
      </div>
    </aside>
  );
}
