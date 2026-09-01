import rawManifest from './reference-manifest.json';

export type DocsNavigationLink = {
  label: string;
  href: string;
  depth?: 0 | 1;
  iconSvg?: string;
};

export type DocsNavigationGroup = {
  label: string;
  links: DocsNavigationLink[];
};

type ManifestDoc = { route: string; html: string };
type NavigationManifest = { docsContent: ManifestDoc[] };

const docsByRoute = new Map(
  (rawManifest as unknown as NavigationManifest).docsContent.map((entry) => [entry.route, entry.html]),
);

const integrationLinks: Array<Omit<DocsNavigationLink, 'iconSvg'> & { iconRoute?: string }> = [
  { label: 'Claude Code Configuration', href: '/docs/integrations/claude-code' },
  { label: 'Install Claude Code', href: '/docs/integrations/claude-code/installation', depth: 1, iconRoute: '/docs/integrations/claude-code' },
  { label: 'Model Provider', href: '/docs/integrations/claude-code/model-provider', depth: 1, iconRoute: '/docs/integrations/claude-code' },
  { label: 'Context Line', href: '/docs/integrations/claude-code/contextline', depth: 1, iconRoute: '/docs/integrations/claude-code' },
  { label: 'Claude Skills', href: '/docs/integrations/claude-code/skills', depth: 1, iconRoute: '/docs/integrations/claude-code' },
  { label: 'Claude Coworks', href: '/docs/integrations/claude-coworks' },
  { label: 'Codex Local Client Setup', href: '/docs/integrations/codex' },
  { label: 'Install Codex CLI', href: '/docs/integrations/codex/installation', depth: 1, iconRoute: '/docs/integrations/codex' },
  { label: 'Configure Model Provider', href: '/docs/integrations/codex/model-provider', depth: 1, iconRoute: '/docs/integrations/codex' },
  { label: 'Enable WebSocket (Recommended)', href: '/docs/integrations/codex/websocket', depth: 1, iconRoute: '/docs/integrations/codex' },
  { label: 'CC-Switch', href: '/docs/integrations/cc-switch' },
  { label: 'OpenClaw', href: '/docs/integrations/openclaw' },
  { label: 'OpenCode', href: '/docs/integrations/opencode' },
  { label: 'Cherry Studio', href: '/docs/integrations/cherry-studio' },
  { label: 'Cursor', href: '/docs/integrations/cursor' },
  { label: 'GitHub Copilot', href: '/docs/integrations/copilot' },
  { label: 'Zed Editor', href: '/docs/integrations/zed' },
  { label: 'Cline', href: '/docs/integrations/cline' },
  { label: 'OpenAI SDK', href: '/docs/integrations/openai-sdk' },
  { label: 'LangChain', href: '/docs/integrations/langchain' },
  { label: 'LlamaIndex', href: '/docs/integrations/llamaindex' },
  { label: 'BotGem', href: '/docs/integrations/botgem' },
  { label: 'Chatbox', href: '/docs/integrations/chatbox' },
  { label: 'WorkBuddy', href: '/docs/integrations/workbuddy' },
  { label: 'LobeHub', href: '/docs/integrations/lobehub' },
  { label: 'OpenCat', href: '/docs/integrations/opencat' },
  { label: 'NextChat', href: '/docs/integrations/nextchat' },
  { label: 'Immersive Translate', href: '/docs/integrations/immersive-translate' },
  { label: 'Other clients', href: '/docs/integrations/others' },
];

function capturedToolIcon(route: string) {
  const html = docsByRoute.get(route) ?? '';
  return html.match(/<svg\b[^>]*class="[^"]*docs-meta-title-icon[^"]*"[^>]*>[\s\S]*?<\/svg>/i)?.[0];
}

function withCapturedIcon(link: (typeof integrationLinks)[number]): DocsNavigationLink {
  return { ...link, iconSvg: capturedToolIcon(link.iconRoute ?? link.href) };
}

export const docsNavigation: DocsNavigationGroup[] = [
  { label: 'Overview', links: [
    { label: 'Documentation', href: '/docs' },
    { label: 'Develop', href: '/docs/develop' },
    { label: 'API Reference', href: '/docs/api' },
    { label: 'Integrations', href: '/docs/integrations' },
  ] },
  { label: 'Develop', links: [
    { label: 'Authentication', href: '/docs/develop/authentication' },
    { label: 'Models', href: '/docs/develop/models' },
    { label: 'Streaming', href: '/docs/develop/guides/streaming' },
    { label: 'Function calling', href: '/docs/develop/guides/function-calling' },
    { label: 'Vision', href: '/docs/develop/guides/vision' },
    { label: 'Structured output', href: '/docs/develop/guides/structured-output' },
    { label: 'Error handling', href: '/docs/develop/guides/error-handling' },
    { label: 'Provider routing', href: '/docs/develop/advanced/provider-routing' },
    { label: 'Fallback', href: '/docs/develop/advanced/fallback' },
    { label: 'Prompt caching', href: '/docs/develop/advanced/prompt-caching' },
    { label: 'Dashboard', href: '/docs/develop/observability/dashboard' },
    { label: 'Usage tracking', href: '/docs/develop/observability/usage-tracking' },
    { label: 'Pricing', href: '/docs/develop/observability/pricing' },
  ] },
  { label: 'API Reference', links: [
    { label: 'OpenAI Chat Completions', href: '/docs/api/openai/chat-completions' },
    { label: 'OpenAI Responses', href: '/docs/api/openai/responses' },
    { label: 'OpenAI Models', href: '/docs/api/openai/models' },
    { label: 'OpenAI Images', href: '/docs/api/openai/images' },
    { label: 'Anthropic Messages', href: '/docs/api/anthropic/messages' },
    { label: 'Anthropic Models', href: '/docs/api/anthropic/models' },
    { label: 'Grok Chat Completions', href: '/docs/api/grok/chat-completions' },
    { label: 'Grok Responses', href: '/docs/api/grok/responses' },
    { label: 'Grok Models', href: '/docs/api/grok/models' },
    { label: 'Balance', href: '/docs/api/openapi/balance' },
    { label: 'Provider pricing', href: '/docs/api/openapi/provider-pricing' },
  ] },
  { label: 'Integrations', links: integrationLinks.map(withCapturedIcon) },
];
