import type { Metadata } from 'next';
import { SiteFrame } from '@/components/site-frame';
import { DocsArticle } from '@/components/docs-article';
import { CopyPageButton } from '@/components/copy-page-button';
import { getDocsPage } from '@/data/content';
export const metadata: Metadata = { title: 'API Quickstart', description: 'Create an API key, test a model, and verify its billed usage.' };
export default function QuickstartPage() {
 const { content } = getDocsPage('/docs/develop');
 return <SiteFrame><main className="page-container quickstart-guide"><CopyPageButton text={content?.text ?? ''} /><DocsArticle html={content?.html ?? ''} /></main></SiteFrame>;
}
