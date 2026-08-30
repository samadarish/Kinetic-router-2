import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsShell } from '@/components/docs-shell';
import { docsRoutes, getDocsPage } from '@/data/content';

type Props = { params: Promise<{ slug?: string[] }> };
function routeFrom(slug?: string[]) { return slug?.length ? `/docs/${slug.join('/')}` : '/docs'; }
export function generateStaticParams() { return [...docsRoutes.map((route) => ({ slug: route === '/docs' ? [] : route.replace('/docs/', '').split('/') })), { slug: ['en'] }]; }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const requestedRoute = routeFrom(slug); const route = requestedRoute === '/docs/en' ? '/docs' : requestedRoute; const { meta, status } = getDocsPage(route); return meta ? { title: meta.title, description: meta.description, alternates: { canonical: meta.canonical }, robots: status.status === 'planned' ? { index: false, follow: false } : undefined, openGraph: { type: 'website', url: meta.canonical, title: meta.title, description: meta.description, images: [] }, twitter: { card: 'summary', title: meta.title, description: meta.description, images: [] } } : {}; }
export default async function DocsPage({ params }: Props) { const { slug } = await params; const requestedRoute = routeFrom(slug); const route = requestedRoute === '/docs/en' ? '/docs' : requestedRoute; const { meta, content, status } = getDocsPage(route); if (!meta || !content) notFound(); return <DocsShell route={route} html={content.html} headings={meta.headings} status={status} />; }
