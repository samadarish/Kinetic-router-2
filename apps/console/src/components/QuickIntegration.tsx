import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Activity, Check, ChevronDown, Code2, Copy, ExternalLink, Globe2, LoaderCircle, TerminalSquare } from 'lucide-react';
import { isProviderIntegrationCopyable } from '../lib/provider-display-status';
import {
  getIntegrationEndpoint,
  getIntegrationExamples,
  getIntegrationProvider,
  integrationLanguages as languages,
  integrationProviderIds,
  integrationRouteIds,
  integrationRoutes,
  type IntegrationLanguage as Language,
  type IntegrationProviderId,
  type IntegrationRouteId,
} from '../lib/quick-integration';
import { measureApiLatency } from '../lib/api-latency';
import { CloudflareIcon, IntegrationProviderIcon } from './IntegrationIcons';
import { CodexIcon } from './CodexIcon';
import { Card } from './Ui';
import { publicSiteHref } from '../lib/public-site';

type CopyTarget = `endpoint-${IntegrationRouteId}` | 'example' | 'codex';
type PingState =
  | { status: 'idle' | 'testing' }
  | { status: 'ready'; ms: number }
  | { status: 'error'; message: string };

const codexConfig = `# Add this provider alongside your existing configuration.
[model_providers.kineticrouter]
name = "kineticRouter"
base_url = "${getIntegrationEndpoint('openai', 'direct')}"
env_key = "KINETICROUTER_API_KEY"
wire_api = "responses"`;

const integrationGuides = [
  { label: 'Codex', description: 'OpenAI coding agent', href: publicSiteHref('/docs/integrations/codex') },
  { label: 'Claude Code', description: 'Anthropic coding agent', href: publicSiteHref('/docs/integrations/claude-code') },
  { label: 'Cherry Studio', description: 'Desktop AI client', href: publicSiteHref('/docs/integrations/cherry-studio') },
  { label: 'OpenClaw', description: 'Agent integration', href: publicSiteHref('/docs/integrations/openclaw') },
  { label: 'Other tools', description: 'Browse more integrations', href: publicSiteHref('/docs/integrations/others') },
];

export function QuickIntegration() {
  const [providerId, setProviderId] = useState<IntegrationProviderId>('openai');
  const [routeId, setRouteId] = useState<IntegrationRouteId>('direct');
  const [language, setLanguage] = useState<Language>('python');
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyError, setCopyError] = useState<CopyTarget | null>(null);
  const [pings, setPings] = useState<Record<IntegrationRouteId, PingState>>({ direct: { status: 'idle' }, cloudflare: { status: 'idle' } });
  const resetCopyRef = useRef<number | null>(null);
  const copyAttemptRef = useRef(0);
  const pingControllers = useRef<Partial<Record<IntegrationRouteId, AbortController>>>({});
  const providerDisplay = getIntegrationProvider(providerId);
  const examples = getIntegrationExamples(providerId, routeId);
  const isAvailable = isProviderIntegrationCopyable(providerDisplay);

  useEffect(() => () => {
    copyAttemptRef.current++;
    if (resetCopyRef.current !== null) window.clearTimeout(resetCopyRef.current);
    for (const controller of Object.values(pingControllers.current)) controller.abort();
  }, []);

  async function copy(value: string, target: CopyTarget) {
    const attempt = ++copyAttemptRef.current;
    try {
      await writeClipboard(value);
      if (attempt !== copyAttemptRef.current) return;
      window.dispatchEvent(new Event('portal:analytics-docs-copy'));
      setCopyError(null);
      setCopied(target);
      if (resetCopyRef.current !== null) window.clearTimeout(resetCopyRef.current);
      resetCopyRef.current = window.setTimeout(() => { setCopied(null); setCopyError(null); }, 1600);
    } catch {
      if (attempt !== copyAttemptRef.current) return;
      setCopied(null);
      setCopyError(target);
      if (resetCopyRef.current !== null) window.clearTimeout(resetCopyRef.current);
      resetCopyRef.current = window.setTimeout(() => setCopyError(null), 2400);
    }
  }

  function clearCopyFeedback() {
    copyAttemptRef.current++;
    if (resetCopyRef.current !== null) window.clearTimeout(resetCopyRef.current);
    setCopied(null);
    setCopyError(null);
  }

  async function testPing(id: IntegrationRouteId) {
    if (pingControllers.current[id]) return;
    const controller = new AbortController();
    pingControllers.current[id] = controller;
    setPings(previous => ({ ...previous, [id]: { status: 'testing' } }));
    try {
      const ms = await measureApiLatency(id, controller.signal);
      if (!controller.signal.aborted) setPings(previous => ({ ...previous, [id]: { status: 'ready', ms } }));
    } catch (error) {
      if (!controller.signal.aborted) {
        const timedOut = error !== null && typeof error === 'object' && 'name' in error && error.name === 'TimeoutError';
        const message = timedOut ? 'Timed out' : 'Could not reach host';
        setPings(previous => ({ ...previous, [id]: { status: 'error', message } }));
      }
    } finally {
      if (pingControllers.current[id] === controller) delete pingControllers.current[id];
    }
  }

  return <section className="quick-integration" aria-labelledby="quick-integration-title">
    <Card className="quick-integration-card">
      <header className="quick-integration-header">
        <div className="integration-title-icon"><Code2 size={19} /></div>
        <div><h2 id="quick-integration-title">Quick Integration</h2><p>Connect with the protocol and SDK your application already uses.</p></div>
      </header>

      <div className="integration-tabs provider-tabs" role="tablist" aria-label="API provider">
        {integrationProviderIds.map((id) => {
          const display = getIntegrationProvider(id);
          return <button
            key={id}
            id={`provider-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={providerId === id}
            aria-controls={`provider-panel-${id}`}
            tabIndex={providerId === id ? 0 : -1}
            data-provider={id}
            onClick={() => { setProviderId(id); clearCopyFeedback(); }}
            onKeyDown={(event) => handleTabsKeydown(event, integrationProviderIds, id, (value) => { setProviderId(value); clearCopyFeedback(); })}
          ><IntegrationProviderIcon provider={id} size={15} /><span>{display.label}</span><small className={`provider-availability ${display.apiState}`}>{display.badgeLabel}</small></button>;
        })}
      </div>

      <div id={`provider-panel-${providerId}`} role="tabpanel" aria-labelledby={`provider-tab-${providerId}`} className="provider-panel">
        {!isAvailable && <div className="integration-availability-warning" role="status"><strong>{providerDisplay.badgeLabel} integration</strong><span>{providerDisplay.summary}</span></div>}
        <div className="integration-endpoints" role="group" aria-label="API connection">
          {integrationRouteIds.map(id => {
            const route = integrationRoutes[id];
            const endpoint = getIntegrationEndpoint(providerId, id);
            const target: CopyTarget = `endpoint-${id}`;
            const ping = pings[id];
            return <div key={id} className="integration-endpoint-card" data-route={id} data-selected={routeId === id}>
              <button className="integration-endpoint-heading" type="button" aria-label={`Use ${route.label}`} aria-pressed={routeId === id} onClick={() => { setRouteId(id); clearCopyFeedback(); }}>
                {id === 'cloudflare' ? <CloudflareIcon /> : <Globe2 size={19} aria-hidden="true" />}
                <strong>{route.label}</strong>
              </button>
              <p className="integration-endpoint-protocol">{isAvailable ? providerDisplay.protocolLabel : `${providerDisplay.badgeLabel} ${providerDisplay.protocolLabel}`} base URL</p>
              <span className="integration-endpoint-url"><code>{endpoint}</code></span>
              <div className="integration-endpoint-controls">
                <button className="copy-button" type="button" disabled={!isAvailable} onClick={() => void copy(endpoint, target)} aria-label={`Copy ${route.label} URL`}>
                  {copied === target ? <Check size={15} /> : <Copy size={15} />}<span>{!isAvailable ? 'Not available' : copied === target ? 'Copied' : copyError === target ? 'Copy failed' : 'Copy URL'}</span>
                </button>
                <button className="copy-button integration-ping-button" type="button" disabled={ping.status === 'testing'} aria-busy={ping.status === 'testing'} aria-label={`Test ${route.label} ping`} onClick={() => void testPing(id)}>
                  {ping.status === 'testing' ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}<span>{ping.status === 'testing' ? 'Testing…' : 'Test ping'}</span>
                </button>
                <span className="integration-ping-result" data-status={ping.status} role="status" aria-label={`${route.label} ping result`} aria-live="polite">{ping.status === 'ready' ? `${ping.ms} ms` : ping.status === 'error' ? ping.message : ping.status === 'testing' ? 'Testing…' : 'Not tested'}</span>
              </div>
            </div>;
          })}
        </div>
        <p className="integration-latency-note">Connection latency from your browser; model response times may differ.</p>
        <div className="integration-model-note"><span>Example model</span><code>{providerDisplay.model}</code></div>

        <details className="example-disclosure">
          <summary><span><TerminalSquare size={16} />Example Code</span><span className="example-summary-hint">{isAvailable ? 'Python, Node.js, and cURL' : 'Future reference only'}</span><ChevronDown size={16} /></summary>
          <div className="example-content">
            <div className="example-toolbar">
              <div className="integration-tabs language-tabs" role="tablist" aria-label="Code language">
                {languages.map((id) => <button
                  key={id}
                  id={`language-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={language === id}
                  aria-controls={`language-panel-${id}`}
                  tabIndex={language === id ? 0 : -1}
                  onClick={() => { setLanguage(id); clearCopyFeedback(); }}
                  onKeyDown={(event) => handleTabsKeydown(event, languages, id, (value) => { setLanguage(value); clearCopyFeedback(); })}
                >{languageLabel(id)}</button>)}
              </div>
              <button className="copy-code-button" type="button" disabled={!isAvailable} onClick={() => void copy(examples[language], 'example')}>
                {copied === 'example' ? <Check size={14} /> : <Copy size={14} />}{!isAvailable ? providerDisplay.badgeLabel : copied === 'example' ? 'Copied' : copyError === 'example' ? 'Copy failed' : 'Copy code'}
              </button>
            </div>
            <pre id={`language-panel-${language}`} role="tabpanel" aria-labelledby={`language-tab-${language}`} tabIndex={0} className="integration-code"><code>{examples[language]}</code></pre>
          </div>
        </details>
      </div>
    </Card>

    <div className="integration-support-grid">
      <Card className="codex-integration-card">
        <header><span><CodexIcon size={18} /></span><div><h2>Connect Codex</h2><p>Set KINETICROUTER_API_KEY in your terminal, then test an available Responses model.</p></div></header>
        <details className="codex-config-disclosure">
          <summary><span>Configuration</span><span>~/.codex/config.toml</span><ChevronDown size={15} /></summary>
          <pre className="codex-code" tabIndex={0}><code>{codexConfig}</code></pre>
          <pre className="codex-code" tabIndex={0}><code>{'codex -c model_provider="kineticrouter" -m "YOUR_AVAILABLE_MODEL_ID"'}</code></pre>
        </details>
        <div className="codex-actions">
          <button type="button" onClick={() => void copy(codexConfig, 'codex')}>{copied === 'codex' ? <Check size={14} /> : <Copy size={14} />}{copied === 'codex' ? 'Copied' : copyError === 'codex' ? 'Copy failed' : 'Copy config'}</button>
          <a className="integration-guide-link" href={publicSiteHref('/docs/integrations/codex')} target="_blank" rel="noreferrer">View tutorial <ExternalLink size={14} /></a>
        </div>
      </Card>

      <Card className="integration-guides-card">
        <header><h2>Integration guides</h2><p>Step-by-step setup for popular clients.</p></header>
        <div className="integration-guide-list">
          {integrationGuides.map((guide) => <a key={guide.href} href={guide.href} target="_blank" rel="noreferrer"><span><strong>{guide.label}</strong><small>{guide.description}</small></span><ExternalLink size={14} /></a>)}
        </div>
      </Card>
    </div>
    <span className="copy-announcement" aria-live="polite">{copied ? 'Copied to clipboard' : copyError ? 'Copy failed. Select the text and copy it manually.' : ''}</span>
  </section>;
}

function languageLabel(language: Language) {
  if (language === 'node') return 'Node.js';
  if (language === 'curl') return 'cURL';
  return 'Python';
}

function handleTabsKeydown<T extends string>(event: KeyboardEvent<HTMLButtonElement>, values: readonly T[], current: T, select: (value: T) => void) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = values.indexOf(current);
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : event.key === 'ArrowRight' ? (currentIndex + 1) % values.length : (currentIndex - 1 + values.length) % values.length;
  const nextValue = values[nextIndex];
  if (nextValue === undefined) return;
  select(nextValue);
  const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  tabs?.[nextIndex]?.focus();
}

async function writeClipboard(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.focus();
    textarea.select();
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
    previousFocus?.focus();
  }
  if (!copied) throw new Error('Clipboard is unavailable.');
}
