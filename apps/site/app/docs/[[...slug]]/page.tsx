import type { Metadata } from 'next';
import { localizedPageMetadata } from '@/data/locale';
import { SeoJsonLd } from '@/components/seo-json-ld';
import { notFound } from 'next/navigation';
import { DocsShell } from '@/components/docs-shell';
import { docsRoutes, getDocsPage } from '@/data/content';
import { getLocalizedDocsPage } from '@/data/localized-documentation';
import { getRequestLocale } from '@/data/locale';
import { getDocsPresentation } from '@/data/docs-presentation';

type Props = { params: Promise<{ slug?: string[] }> };
function routeFrom(slug?: string[]) { return slug?.length ? `/docs/${slug.join('/')}` : '/docs'; }
export function generateStaticParams() { return [...docsRoutes.map((route) => ({ slug: route === '/docs' ? [] : route.replace('/docs/', '').split('/') })), { slug: ['en'] }]; }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { slug } = await params; const requestedRoute = routeFrom(slug); const route = requestedRoute === '/docs/en' ? '/docs' : requestedRoute; if (!getDocsPage(route).meta) notFound(); return localizedPageMetadata(requestedRoute); }
export default async function DocsPage({ params }: Props) { const { slug } = await params; const requestedRoute = routeFrom(slug); const route = requestedRoute === '/docs/en' ? '/docs' : requestedRoute; const page = await getLocalizedDocsPage(route, await getRequestLocale()); const presentation = getDocsPresentation(page); if (!page.meta || !page.content || !presentation) notFound(); return <><SeoJsonLd route={requestedRoute} /><DocsShell route={route} presentation={presentation} text={page.content.text} status={page.status} /></>; }
