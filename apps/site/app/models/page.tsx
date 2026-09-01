import type { Metadata } from 'next';
import { ModelCatalog } from '@/components/model-catalog';
import { SiteFrame } from '@/components/site-frame';
import { getPageMeta, models } from '@/data/content';

const page = getPageMeta('/models');
export const metadata: Metadata = { title: page?.title ?? 'Models & pricing', description: page?.description };

export default function ModelsPage() { return <SiteFrame><ModelCatalog models={models} /></SiteFrame>; }
