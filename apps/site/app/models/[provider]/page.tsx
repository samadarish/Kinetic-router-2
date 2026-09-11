import { catalogModel } from '@/data/model-utils';
import type { Metadata } from 'next';
import { pageMetadata } from '@/data/seo';
import { notFound } from 'next/navigation';
import { ModelCatalog } from '@/components/model-catalog';
import { SiteFrame } from '@/components/site-frame';
import { models } from '@/data/content';

type Props = { params: Promise<{ provider: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { provider } = await params; if (!['openai', 'anthropic', 'grok'].includes(provider)) notFound(); return pageMetadata(`/models/${provider}`); }
export default async function ProviderModelsPage({ params }: Props) { const { provider } = await params; if (!['openai', 'anthropic', 'grok'].includes(provider)) notFound(); return <SiteFrame seoRoute={`/models/${provider}`}><ModelCatalog models={models.map(catalogModel)} initialProvider={provider} /></SiteFrame>; }
