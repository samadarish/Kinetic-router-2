import { catalogModel } from '@/data/model-utils';
import { pageMetadata } from '@/data/seo';
import { ModelCatalog } from '@/components/model-catalog';
import { SiteFrame } from '@/components/site-frame';
import { models } from '@/data/content';

export const metadata = pageMetadata('/models/category/chat');

export default function ChatModelsPage() { return <SiteFrame seoRoute="/models/category/chat"><ModelCatalog models={models.filter((model) => model.category === 'chat').map(catalogModel)} /></SiteFrame>; }
