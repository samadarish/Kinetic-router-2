import { CopyPageButton } from './copy-page-button';
import { DocsHeader } from './docs-header';
import { rebrandHtml } from '@/data/brand';
import type { DocumentationStatus } from '@/data/documentation';
import { DocsStatusBanner } from './docs-status-banner';

const groups = [
  { label: 'Overview', links: [['Documentation', '/docs'], ['Develop', '/docs/develop'], ['API Reference', '/docs/api'], ['Integrations', '/docs/integrations']] },
  { label: 'Develop', links: [['Authentication', '/docs/develop/authentication'], ['Models', '/docs/develop/models'], ['Streaming', '/docs/develop/guides/streaming'], ['Function calling', '/docs/develop/guides/function-calling'], ['Vision', '/docs/develop/guides/vision'], ['Structured output', '/docs/develop/guides/structured-output'], ['Error handling', '/docs/develop/guides/error-handling'], ['Provider routing', '/docs/develop/advanced/provider-routing'], ['Fallback', '/docs/develop/advanced/fallback'], ['Prompt caching', '/docs/develop/advanced/prompt-caching'], ['Dashboard', '/docs/develop/observability/dashboard'], ['Usage tracking', '/docs/develop/observability/usage-tracking'], ['Pricing', '/docs/develop/observability/pricing']] },
  { label: 'API Reference', links: [['OpenAI Chat Completions', '/docs/api/openai/chat-completions'], ['OpenAI Responses', '/docs/api/openai/responses'], ['OpenAI Models', '/docs/api/openai/models'], ['OpenAI Images', '/docs/api/openai/images'], ['Anthropic Messages', '/docs/api/anthropic/messages'], ['Anthropic Models', '/docs/api/anthropic/models'], ['Grok Chat Completions', '/docs/api/grok/chat-completions'], ['Grok Responses', '/docs/api/grok/responses'], ['Grok Models', '/docs/api/grok/models'], ['Balance', '/docs/api/openapi/balance'], ['Provider pricing', '/docs/api/openapi/provider-pricing']] },
  { label: 'Integrations', links: [['Claude Code', '/docs/integrations/claude-code'], ['Claude Coworks', '/docs/integrations/claude-coworks'], ['Codex', '/docs/integrations/codex'], ['CC Switch', '/docs/integrations/cc-switch'], ['OpenClaw', '/docs/integrations/openclaw'], ['OpenCode', '/docs/integrations/opencode'], ['Cherry Studio', '/docs/integrations/cherry-studio'], ['Cursor', '/docs/integrations/cursor'], ['Copilot', '/docs/integrations/copilot'], ['Zed', '/docs/integrations/zed'], ['Cline', '/docs/integrations/cline'], ['OpenAI SDK', '/docs/integrations/openai-sdk'], ['LangChain', '/docs/integrations/langchain'], ['LlamaIndex', '/docs/integrations/llamaindex'], ['Chatbox', '/docs/integrations/chatbox'], ['More integrations', '/docs/integrations/others']] },
];

function pageToc(html: string, fallback: string[]) {
  const matches = [...html.matchAll(/<h[23][^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/gi)].map((match) => ({ id: match[1], heading: match[2].replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&#x27;', "'") }));
  return matches.length ? matches.slice(0, 10) : fallback.filter(Boolean).slice(1, 10).map((heading) => ({ heading, id: heading.toLowerCase().replace(/[^a-z0-9]+/g, '-') }));
}

export function DocsShell({ route, html, headings, status }: { route: string; html: string; headings: string[]; status: DocumentationStatus }) {
  const toc = pageToc(html, headings);
  const renderedHtml = rebrandHtml(html);
  return (
    <div className="min-h-screen bg-background text-foreground"><DocsHeader />
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 pt-16 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_230px]">
        <aside className="hidden h-[calc(100vh-4rem)] overflow-y-auto border-r border-border px-4 py-7 lg:sticky lg:top-16 lg:block">
          {groups.map((group) => <section key={group.label} className="mb-7"><h2 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">{group.label}</h2><nav className="space-y-0.5">{group.links.map(([label, href]) => <a key={href} href={href} className={`block rounded-md px-2 py-1.5 text-[12px] leading-5 ${route === href ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>{label}</a>)}</nav></section>)}
        </aside>
        <main className={`min-w-0 px-5 py-8 sm:px-8 lg:px-10 xl:px-12 docs-route-${status.status}`}><div className="mx-auto max-w-3xl"><DocsStatusBanner status={status} />{status.status !== 'planned' && <CopyPageButton />}<div className="clear-both docs-article" dangerouslySetInnerHTML={{ __html: renderedHtml }} /></div><div className="mx-auto mt-12 flex max-w-3xl items-center justify-between border-t border-border py-8 text-xs text-muted-foreground"><a href="/docs">Kinetic Router Documentation</a><a href="mailto:support@kineticrouter.com">support@kineticrouter.com</a></div></main>
        <aside className="hidden h-[calc(100vh-4rem)] border-l border-border px-5 py-8 xl:sticky xl:top-16 xl:block"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On this page</p><nav className="mt-4 space-y-2">{toc.map(({ heading, id }) => <a key={id} href={`#${id}`} className="block text-[11px] leading-5 text-muted-foreground hover:text-foreground">{heading}</a>)}</nav><div className="mt-8 border-t border-border pt-5 text-[11px] text-muted-foreground"><a href="/llms.txt" className="block py-1 hover:text-foreground">Copy page for LLMs</a><a href="mailto:support@kineticrouter.com" className="block py-1 hover:text-foreground">Need help? Email support ↗</a></div></aside>
      </div>
    </div>
  );
}
