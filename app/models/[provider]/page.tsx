import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModelCatalog } from '@/components/model-catalog';
import { SiteFrame } from '@/components/site-frame';
import { getPageMeta, models } from '@/data/content';

type Props = { params: Promise<{ provider: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { provider } = await params; const page = getPageMeta(`/models/${provider}`); return { title: page?.title ?? `${provider} models`, description: page?.description }; }
export default async function ProviderModelsPage({ params }: Props) { const { provider } = await params; if (!['openai', 'anthropic', 'grok'].includes(provider)) notFound(); return <SiteFrame><ModelCatalog models={models} initialProvider={provider} /></SiteFrame>; }
