import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublishedPageBlocks } from '@/components/published-page-blocks';
import { ProviderLogo } from '@/components/provider-logo';
import { SiteFrame } from '@/components/site-frame';
import { getPageMeta } from '@/data/content';
import { providerAvailability, providerDisplayStatus } from '@/data/provider-availability';
import { hasPublishedPageBlocks, loadPublishedSiteContent, publishedPageEntry } from '@/data/site-content';

const fallbackPage = getPageMeta('/quickstart');
const openAiStatus = providerDisplayStatus('openai');
const fallbackMetadata: Metadata = { title: fallbackPage?.title ?? 'API Quickstart', description: `Configure the kineticRouter ${openAiStatus.protocolLabel} route. ${openAiStatus.summary}` };

export async function generateMetadata(): Promise<Metadata> {
  const content = await loadPublishedSiteContent();
  const published = publishedPageEntry(content, 'quickstart');
  return published?.enabled ? { title: published.title, description: published.description || fallbackMetadata.description } : fallbackMetadata;
}
const steps = [['⌕', 'Get API Key', 'Sign in to the connected customer console and create a key.'], ['‹›', 'Integrate Code', 'Use the detected OpenAI-compatible base URL and a supported model ID.'], ['ϟ', 'Validate', 'Run an authenticated smoke test before moving the integration to production.']];
const code = `curl -X POST ${providerAvailability.openai.baseUrl}/chat/completions -H "Content-Type: application/json" -H "Authorization: Bearer $KINETICROUTER_API_KEY" -d '{
  "model": "openai/gpt-5.4",
  "messages": [{"role": "user", "content": "Hello World!"}]
}'`;

export default async function QuickstartPage() {
  const content = await loadPublishedSiteContent();
  const published = publishedPageEntry(content, 'quickstart');
  if (published && !published.enabled) notFound();
  if (hasPublishedPageBlocks(published)) return <SiteFrame content={content}><PublishedPageBlocks page={published} content={content} /></SiteFrame>;
  const status = openAiStatus;
  return <SiteFrame><section className="page-container pb-14 pt-10 text-center md:pb-20 md:pt-14"><div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[10px] text-muted-foreground"><ProviderLogo provider="openai" className="h-3.5 w-3.5" /> {status.protocolLabel} route · {status.badgeLabel.toLowerCase()} verification</div><h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-.045em] md:text-[3.4rem]"><span className="text-primary">3 Steps</span> to Connect Your<br className="hidden sm:block" /> Agent</h1><p className="mt-4 text-sm text-muted-foreground">Configure, authenticate, and validate the exact feature you plan to ship.</p><div className="relative mx-auto mt-14 grid max-w-4xl gap-7 md:grid-cols-3"><div className="absolute left-[16%] right-[16%] top-8 hidden h-px bg-border md:block" />{steps.map(([icon, title, copy], index) => <article key={title} className="relative"><span className="relative z-10 mx-auto grid h-16 w-16 place-items-center rounded-full border border-border bg-background text-2xl text-primary">{icon}</span><h2 className="mt-5 text-sm font-semibold"><span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] text-white">{index + 1}</span>{title}</h2><p className="mx-auto mt-2 max-w-[230px] text-[11px] leading-5 text-muted-foreground">{copy}</p></article>)}</div><div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-lg border border-border bg-[var(--code)] text-left shadow-xl"><div className="flex items-center border-b border-border px-4 py-3 text-[11px] text-muted-foreground"><ProviderLogo provider="openai" className="mr-2 h-4 w-4" />Authenticated smoke-test example</div><pre className="overflow-auto p-5 font-mono text-[12px] leading-7 text-[#dce2f8]"><code>{code}</code></pre></div></section><section className="border-y border-border bg-muted/25 py-14 text-center"><h2 className="text-3xl font-semibold tracking-tight">Ready to test your integration?</h2><p className="mt-3 text-sm text-muted-foreground">Use the connected console for an authoritative API key and account capabilities.</p><a href="/account/sign-in" className="mt-7 inline-flex rounded-lg bg-primary px-7 py-3 text-sm font-semibold text-white">Open console</a></section></SiteFrame>;
}
