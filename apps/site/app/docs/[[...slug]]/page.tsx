import type { Metadata } from 'next';
import { pageMetadata } from '@/data/seo';
import { SeoJsonLd } from '@/components/seo-json-ld';
import { notFound } from 'next/navigation';
import { DocsShell } from '@/components/docs-shell';
import { docsRoutes, getDocsPage } from '@/data/content';
import { getDocsPresentation } from '@/data/docs-presentation';

type Props = { params: Promise<{ slug?: string[] }> };
function routeFrom(slug?: string[]) { return slug?.length ? `/docs/${slug.join('/')}` : '/docs'; }
export function generateStaticParams() { return [...docsRoutes.map((route) => ({ slug: route === '/docs' ? [] : route.replace('/docs/', '').split('/') })), { slug: ['en'] }]; }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const requestedRoute = routeFrom(slug); const route = requestedRoute === '/docs/en' ? '/docs' : requestedRoute; if (!getDocsPage(route).meta) notFound(); return pageMetadata(requestedRoute); }
export default async function DocsPage({ params }: Props) { const { slug } = await params; const requestedRoute = routeFrom(slug); const route = requestedRoute === '/docs/en' ? '/docs' : requestedRoute; const page = getDocsPage(route); const presentation = getDocsPresentation(page); if (!page.meta || !page.content || !presentation) notFound(); return <><SeoJsonLd route={requestedRoute} /><DocsShell route={route} presentation={presentation} text={page.content.text} status={page.status} /></>; }
