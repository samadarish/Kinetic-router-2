import { ModelCatalog } from '@/components/model-catalog';
import { SiteFrame } from '@/components/site-frame';
import { models } from '@/data/content';
import { applyPublishedModelContent, loadPublishedSiteContent } from '@/data/site-content';

export default async function ChatModelsPage() { const siteContent = await loadPublishedSiteContent(); return <SiteFrame><ModelCatalog models={applyPublishedModelContent(models, siteContent).filter((model) => model.category === 'chat')} /></SiteFrame>; }
