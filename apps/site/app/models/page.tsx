import { catalogModel } from '@/data/model-utils';
import { localizedPageMetadata } from '@/data/locale';
import { ModelCatalog } from '@/components/model-catalog';
import { SiteFrame } from '@/components/site-frame';
import { models } from '@/data/content';

export async function generateMetadata() { return localizedPageMetadata('/models'); }

export default function ModelsPage() { return <SiteFrame seoRoute="/models"><ModelCatalog models={models.map(catalogModel)} /></SiteFrame>; }
