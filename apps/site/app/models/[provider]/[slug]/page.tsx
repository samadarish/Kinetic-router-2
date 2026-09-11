import type { Metadata } from 'next';
import { pageMetadata } from '@/data/seo';
import { notFound } from 'next/navigation';
import { ModelDetail } from '@/components/model-detail';
import { SiteFrame } from '@/components/site-frame';
import { models } from '@/data/content';

type Props = { params: Promise<{ provider: string; slug: string }> };
export function generateStaticParams() { return models.map((model) => ({ provider: model.provider, slug: model.slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { provider, slug } = await params; if (!models.some((item) => item.provider === provider && item.slug === slug)) notFound(); return pageMetadata(`/models/${provider}/${slug}`); }
export default async function ModelDetailPage({ params }: Props) { const { provider, slug } = await params; const model = models.find((item) => item.provider === provider && item.slug === slug); if (!model) notFound(); return <SiteFrame seoRoute={`/models/${provider}/${slug}`}><ModelDetail model={model} /></SiteFrame>; }
