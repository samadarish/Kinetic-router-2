import { catalogModel } from '@/data/model-utils';
import { pageMetadata } from '@/data/seo';
import { ModelCatalog } from '@/components/model-catalog';
import { SiteFrame } from '@/components/site-frame';
import { models } from '@/data/content';

export const metadata = pageMetadata('/models');

export default function ModelsPage() { return <SiteFrame seoRoute="/models"><ModelCatalog models={models.map(catalogModel)} /></SiteFrame>; }
