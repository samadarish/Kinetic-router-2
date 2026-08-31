import type { Metadata } from 'next';
import { ModelCatalog } from '@/components/model-catalog';
import { SiteFrame } from '@/components/site-frame';
import { getPageMeta, models } from '@/data/content';
import { applyPublishedModelContent, loadPublishedSiteContent } from '@/data/site-content';

const page = getPageMeta('/models');
export const metadata: Metadata = { title: page?.title ?? 'Models & pricing', description: page?.description };

export default async function ModelsPage() { const siteContent = await loadPublishedSiteContent(); return <SiteFrame><ModelCatalog models={applyPublishedModelContent(models, siteContent)} /></SiteFrame>; }
