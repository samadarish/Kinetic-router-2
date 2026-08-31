import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CatalogNotice } from '@/components/catalog-notice';
import { PricingComparison } from '@/components/pricing-comparison';
import { PublishedPageBlocks } from '@/components/published-page-blocks';
import { SiteFrame } from '@/components/site-frame';
import { catalogSnapshot } from '@/data/documentation';
import { discountRate, getPageMeta, models } from '@/data/content';
import { providerDisplayStatus } from '@/data/provider-availability';
import { hasPublishedPageBlocks, loadPublishedSiteContent, publishedPageEntry } from '@/data/site-content';

const fallbackPage = getPageMeta('/pricing');
const fallbackMetadata: Metadata = { title: fallbackPage?.title ?? 'API Pricing Reference', description: 'Imported model and price snapshot with kineticRouter route availability clearly marked.' };

export async function generateMetadata(): Promise<Metadata> {
  const content = await loadPublishedSiteContent();
  const published = publishedPageEntry(content, 'pricing');
  return published?.enabled ? { title: published.title, description: published.description || fallbackMetadata.description } : fallbackMetadata;
}

const rates = models.map(discountRate).filter((value): value is number => value != null);
const rateRange = `${Math.min(...rates).toFixed(2)}x–${Math.max(...rates).toFixed(2)}x`;
const activePriceRows = models.reduce((count, model) => count + model.prices.filter((price) => price.active).length, 0);
const metrics = [[rateRange, 'Snapshot multiplier range'], [String(models.length), 'Reference models'], [String(activePriceRows), 'Active snapshot price rows'], [catalogSnapshot.capturedAt, 'Snapshot captured']];

export default async function PricingPage() {
  const content = await loadPublishedSiteContent();
  const published = publishedPageEntry(content, 'pricing');
  if (published && !published.enabled) notFound();
  if (hasPublishedPageBlocks(published)) return <SiteFrame content={content}><PublishedPageBlocks page={published} content={content} /></SiteFrame>;
  const openAi = providerDisplayStatus('openai');
  const anthropic = providerDisplayStatus('anthropic');
  const grok = providerDisplayStatus('grok');
  return <SiteFrame content={content}>
    <section className="px-4 pb-12 pt-16 text-center md:pb-16 md:pt-24">
      <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">Pricing reference</p>
      <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-semibold leading-[1.1] tracking-[-.045em] md:text-[3.5rem]">Transparent reference pricing,<br className="hidden sm:block" /> with honest route status</h1>
      <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-muted-foreground">These model names and price values are preserved from an imported snapshot captured on {catalogSnapshot.capturedAt}. They are not a live kineticRouter billing feed; your customer portal remains authoritative.</p>
      <div className="mx-auto mt-7 max-w-3xl text-left"><CatalogNotice /></div>
      <div className="mx-auto mt-10 grid max-w-5xl overflow-hidden rounded-lg border border-border sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([value, label]) => <div key={label} className="border-b border-border px-4 py-5 last:border-0 sm:border-r lg:border-b-0"><strong className="block text-2xl font-semibold text-primary">{value}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{label}</span></div>)}</div>
    </section>
    <section className="border-y border-border bg-muted/20 py-12 md:py-16"><div className="page-container"><div className="grid gap-3 md:grid-cols-3">{[
      ['Exact values', 'No rounded-away micro-prices', 'Snapshot prices display up to six decimal places so values such as $0.075/M and $3.125/M remain exact.'],
      ['Separated facts', 'Upstream vs gateway limits', 'Updated upstream context facts are shown separately from the gateway limits recorded in the imported snapshot.'],
      ['Availability', 'Routes are status-marked', `${openAi.label} is ${openAi.badgeLabel}. ${anthropic.label} is ${anthropic.badgeLabel}, and ${grok.label} is ${grok.badgeLabel}.`],
    ].map(([lead, title, copy]) => <article key={lead} className="surface p-6"><p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{lead}</p><h2 className="mt-3 text-lg font-semibold">{title}</h2><p className="mt-3 text-xs leading-6 text-muted-foreground">{copy}</p></article>)}</div></div></section>
    <PricingComparison models={models} />
    <section className="border-t border-border py-16 text-center"><div className="page-container"><h2 className="text-3xl font-semibold tracking-tight">Check your actual balance and billing in the console</h2><p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">The public catalog is for comparison. Account-specific prices, subscriptions, balances, and usage come from the connected Sub2API customer portal.</p><div className="mt-7 flex justify-center gap-3"><a href="/models" className="rounded-lg border border-border px-6 py-3 text-sm font-semibold">Browse models</a><a href="/account/sign-in" className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white">Open console</a></div></div></section>
  </SiteFrame>;
}
