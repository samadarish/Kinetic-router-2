import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsShell } from '@/components/docs-shell';
import { docsRoutes, getDocsPage } from '@/data/content';

type Props = { params: Promise<{ slug?: string[] }> };
function routeFrom(slug?: string[]) { return slug?.length ? `/docs/${slug.join('/')}` : '/docs'; }
export function generateStaticParams() { return [...docsRoutes.map((route) => ({ slug: route === '/docs' ? [] : route.replace('/docs/', '').split('/') })), { slug: ['en'] }]; }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const requestedRoute = routeFrom(slug); const route = requestedRoute === '/docs/en' ? '/docs' : requestedRoute; const { meta, status } = getDocsPage(route); if (!meta) return {}; const title = status.status === 'planned' ? `${meta.title} (${status.label})` : meta.title; const description = `${status.summary} ${meta.description}`; return { title, description, alternates: { canonical: meta.canonical }, robots: status.status === 'planned' ? { index: false, follow: false } : undefined, openGraph: { type: 'website', url: meta.canonical, title, description, images: [] }, twitter: { card: 'summary', title, description, images: [] } }; }
export default async function DocsPage({ params }: Props) { const { slug } = await params; const requestedRoute = routeFrom(slug); const route = requestedRoute === '/docs/en' ? '/docs' : requestedRoute; const { meta, content, status } = getDocsPage(route); if (!meta || !content) notFound(); return <DocsShell route={route} html={content.html} headings={meta.headings} status={status} />; }
