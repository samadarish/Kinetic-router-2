import { ArrowRightIcon, CheckIcon, SparklesIcon } from './icons';
import { ProviderLogo } from './provider-logo';

export function MarketingHero({ eyebrow, title, description, children }: { eyebrow: string; title: React.ReactNode; description: string; children?: React.ReactNode }) {
  return <section className="hero-grid hero-glow relative overflow-hidden border-b border-border/60 py-16 text-center md:py-24"><div className="relative z-10 mx-auto max-w-4xl px-4"><p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">{eyebrow}</p><h1 className="mt-4 text-4xl font-semibold leading-[1.12] tracking-[-.045em] md:text-6xl">{title}</h1><p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">{description}</p>{children}</div></section>;
}

export const protocolCards = [
  { name: 'OpenAI compatible', provider: 'openai', endpoint: 'https://api.kineticrouter.com/v1', copy: 'The base route is detected. Validate each model feature with your authenticated account.', status: 'PARTIAL' },
  { name: 'Anthropic native', provider: 'anthropic', endpoint: 'Planned route', copy: 'The Anthropic-native Messages route is retained as a roadmap integration, not a live endpoint.', status: 'PLANNED' },
  { name: 'Grok / xAI protocol', provider: 'grok', endpoint: 'Planned route', copy: 'The dedicated Grok route is retained as a roadmap integration, not a live endpoint.', status: 'PLANNED' },
];

export function ProtocolCards() {
  return <div className="grid gap-3 md:grid-cols-3">{protocolCards.map((item) => <article key={item.name} className="surface p-5"><div className="flex items-center"><ProviderLogo provider={item.provider} className="h-7 w-7" /><span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[8px] font-semibold tracking-wider text-muted-foreground">{item.status}</span></div><h2 className="mt-5 text-sm font-semibold">{item.name}</h2><p className="mt-2 min-h-12 text-xs leading-5 text-muted-foreground">{item.copy}</p><code className="mt-5 block overflow-hidden text-ellipsis whitespace-nowrap rounded-lg bg-muted p-3 font-mono text-[10px] text-primary">{item.endpoint}</code></article>)}</div>;
}

export function FinalCta({ title = 'Ready to build with Kinetic Router?' }: { title?: string }) {
  return <section className="border-t border-border py-16 text-center"><div className="page-container"><SparklesIcon className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h2><p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">Create an API key for the OpenAI-compatible route, and follow the status-marked docs as additional native routes are enabled.</p><div className="mt-7 flex justify-center gap-3"><a href="https://console.kineticrouter.com/sign-in" className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white">Get started <ArrowRightIcon className="h-4 w-4" /></a><a href="/docs" className="rounded-lg border border-border px-6 py-3 text-sm font-semibold">Read the docs</a></div></div></section>;
}

export function FeatureList({ items }: { items: string[] }) { return <ul className="space-y-3">{items.map((item) => <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--brand-soft-bg)] text-[var(--brand-soft-text)]"><CheckIcon className="h-3 w-3" /></span>{item}</li>)}</ul>; }
