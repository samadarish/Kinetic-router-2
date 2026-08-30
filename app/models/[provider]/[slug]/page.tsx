import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModelDetail } from '@/components/model-detail';
import { SiteFrame } from '@/components/site-frame';
import { getModel, models } from '@/data/content';

type Props = { params: Promise<{ provider: string; slug: string }> };
export function generateStaticParams() { return models.map((model) => ({ provider: model.provider, slug: model.slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { provider, slug } = await params; const model = getModel(provider, slug); if (!model) return {}; const title = `${model.name} API & Pricing`; const description = model.tagline; const canonical = `/models/${provider}/${slug}`; return { title, description, alternates: { canonical }, openGraph: { type: 'website', url: canonical, title, description, images: [] }, twitter: { card: 'summary', title, description, images: [] } }; }
export default async function ModelDetailPage({ params }: Props) { const { provider, slug } = await params; const model = getModel(provider, slug); if (!model) notFound(); return <SiteFrame><ModelDetail model={model} /></SiteFrame>; }
