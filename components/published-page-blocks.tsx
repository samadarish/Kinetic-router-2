import type { ReactNode } from 'react';
import type {
  SiteContentBlock,
  SiteContentDocument,
  SitePageContent,
} from '@/data/site-content';
import type { ProviderId } from '@/data/provider-availability';
import { normalizeSiteHref } from '@/data/safe-href.mjs';
import { ArrowRightIcon } from './icons';
import { ProviderLogo } from './provider-logo';

type DataRecord = Record<string, unknown>;

function dataRecord(value: unknown): DataRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DataRecord : undefined;
}

function parsedValue(value: unknown) {
  if (typeof value !== 'string' || value.length > 100_000 || !/^[\s]*[\[{]/.test(value)) return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function dataString(data: DataRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim() && value.length <= 20_000) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function dataLongString(data: DataRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim() && value.length <= 100_000) return value.trim();
  }
  return undefined;
}

function dataNumber(data: DataRecord, key: string, fallback: number, minimum: number, maximum: number) {
  const raw = data[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback;
}

function dataItems(data: DataRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = parsedValue(data[key]);
    if (Array.isArray(value)) return value.slice(0, 24).flatMap((item) => dataRecord(item) ? [dataRecord(item)!] : []);
  }
  return [];
}

function externalLinkProps(href: string) {
  return href.startsWith('https://') ? { target: '_blank' as const, rel: 'noreferrer' } : {};
}

function InlineMarkdown({ value }: { value: string }) {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(value))) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith('`')) {
      nodes.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[.9em] text-foreground">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      nodes.push(<strong key={key} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = normalizeSiteHref(link?.[2]);
      nodes.push(href
        ? <a key={key} href={href} {...externalLinkProps(href)} className="font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary">{link?.[1]}</a>
        : link?.[1] ?? token);
    }
    cursor = match.index + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return <>{nodes}</>;
}

function MarkdownContent({ source, compact = false }: { source: string; compact?: boolean }) {
  const lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const nodes: ReactNode[] = [];
  let index = 0;
  const paragraphClass = compact ? 'mt-3 text-sm leading-7 text-muted-foreground' : 'mt-4 text-sm leading-7 text-muted-foreground';

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^```([\w.+-]{0,30})\s*$/);
    if (fence) {
      const code: string[] = [];
      const start = index;
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      nodes.push(<pre key={`code-${start}`} className="mt-5 overflow-auto rounded-lg bg-[var(--terminal)] p-4 font-mono text-[11px] leading-6 text-[#dce2f8]"><code data-language={fence[1] || undefined}>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const label = heading[2].trim();
      const level = Math.min(4, heading[1].length + 1);
      const className = level === 2 ? 'mt-8 text-2xl font-semibold tracking-tight text-foreground' : level === 3 ? 'mt-7 text-xl font-semibold text-foreground' : 'mt-6 text-base font-semibold text-foreground';
      nodes.push(level === 2
        ? <h2 key={`heading-${index}`} className={className}><InlineMarkdown value={label} /></h2>
        : level === 3
          ? <h3 key={`heading-${index}`} className={className}><InlineMarkdown value={label} /></h3>
          : <h4 key={`heading-${index}`} className={className}><InlineMarkdown value={label} /></h4>);
      index += 1;
      continue;
    }

    const unordered = /^[-*+]\s+/.test(line);
    const ordered = /^\d+[.)]\s+/.test(line);
    if (unordered || ordered) {
      const start = index;
      const pattern = unordered ? /^[-*+]\s+(.+)$/ : /^\d+[.)]\s+(.+)$/;
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(pattern);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      const children = items.map((item, itemIndex) => <li key={`${start}-${itemIndex}`}><InlineMarkdown value={item} /></li>);
      nodes.push(unordered
        ? <ul key={`list-${start}`} className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground marker:text-primary">{children}</ul>
        : <ol key={`list-${start}`} className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-muted-foreground marker:text-primary">{children}</ol>);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const start = index;
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
      nodes.push(<blockquote key={`quote-${start}`} className="mt-5 border-l-2 border-primary pl-4 text-sm italic leading-7 text-muted-foreground"><InlineMarkdown value={quote.join(' ')} /></blockquote>);
      continue;
    }

    if (/^(?:---+|___+)\s*$/.test(line)) {
      nodes.push(<hr key={`rule-${index}`} className="my-7 border-border" />);
      index += 1;
      continue;
    }

    const start = index;
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(?:#{1,4}\s+|```|[-*+]\s+|\d+[.)]\s+|>\s?|---+\s*$|___+\s*$)/.test(lines[index])) paragraph.push(lines[index++].trim());
    nodes.push(<p key={`paragraph-${start}`} className={paragraphClass}><InlineMarkdown value={paragraph.join(' ')} /></p>);
  }

  return <>{nodes}</>;
}

function BlockActions({ data }: { data: DataRecord }) {
  const primaryLabel = dataString(data, 'primaryLabel', 'buttonLabel', 'label');
  const primaryHref = normalizeSiteHref(dataString(data, 'primaryHref', 'buttonHref', 'href'));
  const secondaryLabel = dataString(data, 'secondaryLabel');
  const secondaryHref = normalizeSiteHref(dataString(data, 'secondaryHref'));
  if ((!primaryLabel || !primaryHref) && (!secondaryLabel || !secondaryHref)) return null;
  return <div className="mt-7 flex flex-wrap justify-center gap-3">
    {primaryLabel && primaryHref && <a href={primaryHref} {...externalLinkProps(primaryHref)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white">{primaryLabel}<ArrowRightIcon className="h-4 w-4" /></a>}
    {secondaryLabel && secondaryHref && <a href={secondaryHref} {...externalLinkProps(secondaryHref)} className="rounded-lg border border-border px-6 py-3 text-sm font-semibold">{secondaryLabel}</a>}
  </div>;
}

function HeroBlock({ block, page }: { block: SiteContentBlock; page: SitePageContent }) {
  const data = block.data as DataRecord;
  const heading = block.heading ?? page.title;
  const body = block.bodyMarkdown ?? (!block.heading ? page.description : '');
  const eyebrow = dataString(data, 'eyebrow', 'label');
  return <section id={block.id} className="hero-grid hero-glow relative overflow-hidden border-b border-border/60 py-16 text-center md:py-24">
    <div className="relative z-10 mx-auto max-w-4xl px-4">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">{eyebrow}</p>}
      <h1 className={`${eyebrow ? 'mt-4' : ''} text-4xl font-semibold leading-[1.12] tracking-[-.045em] md:text-6xl`}>{heading}</h1>
      {body && <div className="mx-auto max-w-2xl"><MarkdownContent source={body} compact /></div>}
      <BlockActions data={data} />
    </div>
  </section>;
}

function RichTextBlock({ block }: { block: SiteContentBlock }) {
  return <section id={block.id} className="page-container py-12 md:py-16"><div className="mx-auto max-w-3xl">
    {block.heading && <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{block.heading}</h2>}
    {block.bodyMarkdown && <MarkdownContent source={block.bodyMarkdown} />}
  </div></section>;
}

function CodeBlock({ block }: { block: SiteContentBlock }) {
  const data = block.data as DataRecord;
  const rawSource = dataLongString(data, 'code', 'source', 'content') ?? block.bodyMarkdown ?? '';
  const fenced = rawSource.match(/^```([\w.+-]{0,30})\s*\n([\s\S]*?)\n```\s*$/);
  const source = fenced?.[2] ?? rawSource;
  const language = dataString(data, 'language') ?? fenced?.[1];
  const filename = dataString(data, 'filename', 'label');
  return <section id={block.id} className="page-container py-12 md:py-16"><div className="mx-auto max-w-4xl">
    {block.heading && <h2 className="text-3xl font-semibold tracking-tight">{block.heading}</h2>}
    {filename && <p className="mt-5 rounded-t-lg border border-b-0 border-border bg-muted/40 px-4 py-2 text-[10px] text-muted-foreground">{filename}</p>}
    <pre className={`${filename ? 'mt-0 rounded-t-none' : 'mt-5'} overflow-auto rounded-lg border border-border bg-[var(--terminal)] p-5 font-mono text-[11px] leading-6 text-[#dce2f8]`}><code data-language={language || undefined}>{source}</code></pre>
  </div></section>;
}

function CardsBlock({ block }: { block: SiteContentBlock }) {
  const data = block.data as DataRecord;
  const items = dataItems(data, 'items', 'cards');
  return <section id={block.id} className="border-y border-border/60 bg-muted/20 py-12 md:py-16"><div className="page-container">
    {block.heading && <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">{block.heading}</h2>}
    {block.bodyMarkdown && <div className="mx-auto max-w-2xl text-center"><MarkdownContent source={block.bodyMarkdown} compact /></div>}
    {items.length > 0 && <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{items.map((item, index) => {
      const title = dataString(item, 'title', 'heading', 'name') ?? `Item ${index + 1}`;
      const body = dataString(item, 'bodyMarkdown', 'description', 'body', 'copy');
      const eyebrow = dataString(item, 'eyebrow', 'label', 'badge');
      const href = normalizeSiteHref(dataString(item, 'href', 'url'));
      return <article key={`${title}-${index}`} className="surface p-6">{eyebrow && <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}<h3 className={`${eyebrow ? 'mt-3' : ''} text-lg font-semibold`}>{title}</h3>{body && <MarkdownContent source={body} compact />}{href && <a href={href} {...externalLinkProps(href)} className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-primary">Learn more <ArrowRightIcon className="h-3.5 w-3.5" /></a>}</article>;
    })}</div>}
  </div></section>;
}

function StatsBlock({ block }: { block: SiteContentBlock }) {
  const data = block.data as DataRecord;
  const items = dataItems(data, 'items', 'stats');
  return <section id={block.id} className="page-container py-12 md:py-16">
    {block.heading && <h2 className="text-center text-3xl font-semibold tracking-tight">{block.heading}</h2>}
    {block.bodyMarkdown && <div className="mx-auto max-w-2xl text-center"><MarkdownContent source={block.bodyMarkdown} compact /></div>}
    {items.length > 0 && <div className="mx-auto mt-8 grid max-w-5xl overflow-hidden rounded-lg border border-border sm:grid-cols-2 lg:grid-cols-4">{items.map((item, index) => {
      const value = dataString(item, 'value', 'stat', 'number') ?? '—';
      const label = dataString(item, 'label', 'title', 'description') ?? `Metric ${index + 1}`;
      return <div key={`${label}-${index}`} className="border-b border-border px-4 py-5 text-center last:border-0 sm:border-r lg:border-b-0"><strong className="block text-2xl font-semibold text-primary">{value}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{label}</span></div>;
    })}</div>}
  </section>;
}

function CtaBlock({ block }: { block: SiteContentBlock }) {
  const data = block.data as DataRecord;
  const eyebrow = dataString(data, 'eyebrow');
  return <section id={block.id} className="border-y border-border bg-muted/25 py-16 text-center"><div className="page-container">
    {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
    {block.heading && <h2 className={`${eyebrow ? 'mt-4' : ''} text-3xl font-semibold tracking-tight md:text-4xl`}>{block.heading}</h2>}
    {block.bodyMarkdown && <div className="mx-auto max-w-xl"><MarkdownContent source={block.bodyMarkdown} compact /></div>}
    <BlockActions data={data} />
  </div></section>;
}

const providerIds: ProviderId[] = ['openai', 'anthropic', 'grok'];

function selectedProviders(data: DataRecord, content: SiteContentDocument) {
  const raw = parsedValue(data.providers);
  const requested = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : typeof raw === 'string' ? raw.split(',').map((item) => item.trim()) : [];
  const selected = providerIds.filter((id) => (!requested.length || requested.includes(id)) && content.providers[id].enabled);
  return requested.length ? selected : providerIds.filter((id) => content.providers[id].enabled);
}

function ProviderTabsBlock({ block, content }: { block: SiteContentBlock; content: SiteContentDocument }) {
  const providers = selectedProviders(block.data as DataRecord, content);
  return <section id={block.id} className="page-container py-12 md:py-16">
    {block.heading && <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">{block.heading}</h2>}
    {block.bodyMarkdown && <div className="mx-auto max-w-2xl text-center"><MarkdownContent source={block.bodyMarkdown} compact /></div>}
    <div className="mt-8 grid gap-3 md:grid-cols-3">{providers.map((id) => {
      const provider = content.providers[id];
      const endpoint = provider.baseUrl ?? provider.previewBaseUrl;
      return <article key={id} className="surface p-6"><div className="flex items-center gap-3"><ProviderLogo provider={id} className="h-7 w-7" /><h3 className="font-semibold">{provider.label}</h3><span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[8px] font-semibold tracking-wider text-muted-foreground">{provider.badgeLabel.toUpperCase()}</span></div><p className="mt-4 text-xs leading-6 text-muted-foreground">{provider.summary}</p>{endpoint && <code className="mt-5 block overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-muted p-3 font-mono text-[10px] text-primary">{endpoint}</code>}</article>;
    })}</div>
  </section>;
}

function priceLabel(value: number) {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
}

function ModelGridBlock({ block, content }: { block: SiteContentBlock; content: SiteContentDocument }) {
  const data = block.data as DataRecord;
  const provider = dataString(data, 'provider');
  const limit = dataNumber(data, 'limit', 12, 1, 24);
  const models = content.models.filter((model) => model.enabled && (!provider || model.provider === provider)).slice(0, limit);
  return <section id={block.id} className="border-y border-border/60 bg-muted/20 py-12 md:py-16"><div className="page-container">
    {block.heading && <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">{block.heading}</h2>}
    {block.bodyMarkdown && <div className="mx-auto max-w-2xl text-center"><MarkdownContent source={block.bodyMarkdown} compact /></div>}
    {models.length > 0 && <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{models.map((model) => <a key={model.id} href={`/models/${model.provider}/${model.slug}`} className="surface block p-5 transition hover:-translate-y-0.5"><div className="flex items-start gap-3"><ProviderLogo provider={model.provider} className="h-6 w-6 shrink-0" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold">{model.name}</h3><p className="mt-1 truncate font-mono text-[9px] text-muted-foreground">{model.id}</p></div></div>{model.description && <p className="mt-4 line-clamp-3 text-xs leading-5 text-muted-foreground">{model.description}</p>}{model.prices.length > 0 && <p className="mt-5 text-[10px] text-muted-foreground"><span className="font-semibold text-primary">{priceLabel(model.prices[0].usd)}</span> / {model.prices[0].unit}</p>}</a>)}</div>}
  </div></section>;
}

function PublishedBlock({ block, page, content }: { block: SiteContentBlock; page: SitePageContent; content: SiteContentDocument }) {
  switch (block.type) {
    case 'hero': return <HeroBlock block={block} page={page} />;
    case 'richText': return <RichTextBlock block={block} />;
    case 'code': return <CodeBlock block={block} />;
    case 'cards': return <CardsBlock block={block} />;
    case 'stats': return <StatsBlock block={block} />;
    case 'cta': return <CtaBlock block={block} />;
    case 'providerTabs': return <ProviderTabsBlock block={block} content={content} />;
    case 'modelGrid': return <ModelGridBlock block={block} content={content} />;
  }
}

export function PublishedPageBlocks({ page, content }: { page: SitePageContent; content: SiteContentDocument }) {
  return <div aria-label={page.title}>{page.blocks.map((block) => <PublishedBlock key={block.id} block={block} page={page} content={content} />)}</div>;
}
