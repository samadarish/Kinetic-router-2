import { localizedPageMetadata } from '@/data/locale';
import { SiteFrame } from '@/components/site-frame';
import { DocsArticle } from '@/components/docs-article';
import { CopyPageButton } from '@/components/copy-page-button';
import { getDocsPage } from '@/data/content';
export async function generateMetadata() { return localizedPageMetadata('/quickstart'); }
export default function QuickstartPage() {
 const { content } = getDocsPage('/docs/develop');
 return <SiteFrame seoRoute="/quickstart"><div className="page-container quickstart-guide"><CopyPageButton text={content?.text ?? ''} /><DocsArticle html={content?.html ?? ''} /></div></SiteFrame>;
}
