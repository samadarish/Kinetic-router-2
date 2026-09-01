import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Code2, Copy, ExternalLink, TerminalSquare } from 'lucide-react';
import {
  getProviderDisplayEndpoint,
  getProviderDisplayStatus,
  isProviderIntegrationCopyable,
  providerDisplayIds,
  type ProviderDisplayId,
} from '../lib/provider-display-status';
import { ProviderIcon } from './ProviderIcon';
import { CodexIcon } from './CodexIcon';
import { Card } from './Ui';
import { publicSiteHref } from '../lib/public-site';

const languages = ['python', 'node', 'curl'] as const;
type Language = typeof languages[number];
type CopyTarget = 'endpoint' | 'example' | 'codex';

type ProviderConfig = {
  model: string;
  examples: Record<Language, string>;
};

const providerEndpoints: Record<ProviderDisplayId, string> = {
  openai: getProviderDisplayEndpoint('openai'),
  anthropic: getProviderDisplayEndpoint('anthropic'),
  grok: getProviderDisplayEndpoint('grok'),
};

const providers: Record<ProviderDisplayId, ProviderConfig> = {
  openai: {
    model: 'openai/gpt-5.4',
    examples: {
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${providerEndpoints.openai}",
    api_key="YOUR_KINETICROUTER_API_KEY",
)

response = client.chat.completions.create(
    model="openai/gpt-5.4",
    messages=[{"role": "user", "content": "Hello!"}],
)

print(response.choices[0].message.content)`,
      node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${providerEndpoints.openai}",
  apiKey: "YOUR_KINETICROUTER_API_KEY",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-5.4",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);`,
      curl: `curl ${providerEndpoints.openai}/chat/completions \\
  -H "Authorization: Bearer YOUR_KINETICROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-5.4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
    },
  },
  anthropic: {
    model: 'anthropic/claude-opus-4.8',
    examples: {
      python: `import anthropic

client = anthropic.Anthropic(
    base_url="${providerEndpoints.anthropic}",
    api_key="YOUR_KINETICROUTER_API_KEY",
)

message = client.messages.create(
    model="anthropic/claude-opus-4.8",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
)

print(message.content[0].text)`,
      node: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "${providerEndpoints.anthropic}",
  apiKey: "YOUR_KINETICROUTER_API_KEY",
});

const message = await client.messages.create({
  model: "anthropic/claude-opus-4.8",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(message.content[0].text);`,
      curl: `curl ${providerEndpoints.anthropic}/v1/messages \\
  -H "x-api-key: YOUR_KINETICROUTER_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "anthropic/claude-opus-4.8",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
    },
  },
  grok: {
    model: 'grok/grok-4.6',
    examples: {
      python: `from openai import OpenAI

client = OpenAI(
    base_url="${providerEndpoints.grok}",
    api_key="YOUR_KINETICROUTER_API_KEY",
)

response = client.chat.completions.create(
    model="grok/grok-4.6",
    messages=[{"role": "user", "content": "Hello!"}],
)

print(response.choices[0].message.content)`,
      node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${providerEndpoints.grok}",
  apiKey: "YOUR_KINETICROUTER_API_KEY",
});

const response = await client.chat.completions.create({
  model: "grok/grok-4.6",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);`,
      curl: `curl ${providerEndpoints.grok}/chat/completions \\
  -H "Authorization: Bearer YOUR_KINETICROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "grok/grok-4.6",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
    },
  },
};

const codexConfig = `# ~/.codex/config.toml
model_provider = "kineticrouter"

[model_providers.kineticrouter]
base_url = "${providerEndpoints.openai}"
wire_api = "responses"
supports_websockets = true`;

const integrationGuides = [
  { label: 'Codex', description: 'OpenAI coding agent', href: publicSiteHref('/docs/integrations/codex') },
  { label: 'Claude Code', description: 'Anthropic coding agent', href: publicSiteHref('/docs/integrations/claude-code') },
  { label: 'Cherry Studio', description: 'Desktop AI client', href: publicSiteHref('/docs/integrations/cherry-studio') },
  { label: 'OpenClaw', description: 'Agent integration', href: publicSiteHref('/docs/integrations/openclaw') },
  { label: 'Other tools', description: 'Browse more integrations', href: publicSiteHref('/docs/integrations/others') },
];

export function QuickIntegration() {
  const [providerId, setProviderId] = useState<ProviderDisplayId>('openai');
  const [language, setLanguage] = useState<Language>('python');
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [copyError, setCopyError] = useState<CopyTarget | null>(null);
  const resetCopyRef = useRef<number | null>(null);
  const provider = providers[providerId];
  const providerDisplay = getProviderDisplayStatus(providerId);
  const endpoint = providerEndpoints[providerId];
  const isAvailable = isProviderIntegrationCopyable(providerDisplay);

  useEffect(() => () => {
    if (resetCopyRef.current !== null) window.clearTimeout(resetCopyRef.current);
  }, []);

  async function copy(value: string, target: CopyTarget) {
    try {
      await writeClipboard(value);
      setCopyError(null);
      setCopied(target);
      if (resetCopyRef.current !== null) window.clearTimeout(resetCopyRef.current);
      resetCopyRef.current = window.setTimeout(() => { setCopied(null); setCopyError(null); }, 1600);
    } catch {
      setCopied(null);
      setCopyError(target);
      if (resetCopyRef.current !== null) window.clearTimeout(resetCopyRef.current);
      resetCopyRef.current = window.setTimeout(() => setCopyError(null), 2400);
    }
  }

  function clearCopyFeedback() {
    setCopied(null);
    setCopyError(null);
  }

  return <section className="quick-integration" aria-labelledby="quick-integration-title">
    <Card className="quick-integration-card">
      <header className="quick-integration-header">
        <div className="integration-title-icon"><Code2 size={19} /></div>
        <div><h2 id="quick-integration-title">Quick Integration</h2><p>Connect with the protocol and SDK your application already uses.</p></div>
      </header>

      <div className="integration-tabs provider-tabs" role="tablist" aria-label="API provider">
        {providerDisplayIds.map((id) => {
          const display = getProviderDisplayStatus(id);
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
            onKeyDown={(event) => handleTabsKeydown(event, providerDisplayIds, id, (value) => { setProviderId(value); clearCopyFeedback(); })}
          ><ProviderIcon provider={id} size={15} /><span>{display.label}</span><small className={`provider-availability ${display.apiState}`}>{display.badgeLabel}</small></button>;
        })}
      </div>

      <div id={`provider-panel-${providerId}`} role="tabpanel" aria-labelledby={`provider-tab-${providerId}`} className="provider-panel">
        {!isAvailable && <div className="integration-availability-warning" role="status"><strong>{providerDisplay.badgeLabel} integration</strong><span>{providerDisplay.summary}</span></div>}
        <div className="endpoint-row">
          <div><span>{isAvailable ? providerDisplay.protocolLabel : `${providerDisplay.badgeLabel} ${providerDisplay.protocolLabel}`} base URL</span><code>{endpoint}</code></div>
          <button className="copy-button" type="button" disabled={!isAvailable} onClick={() => void copy(endpoint, 'endpoint')} aria-label={isAvailable ? `Copy ${providerDisplay.label} base URL` : `${providerDisplay.label} base URL is ${providerDisplay.apiState} and cannot be copied`}>
            {copied === 'endpoint' ? <Check size={15} /> : <Copy size={15} />}<span>{!isAvailable ? 'Not available' : copied === 'endpoint' ? 'Copied' : copyError === 'endpoint' ? 'Copy failed' : 'Copy URL'}</span>
          </button>
        </div>
        <div className="integration-model-note"><span>Example model</span><code>{provider.model}</code></div>

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
              <button className="copy-code-button" type="button" disabled={!isAvailable} onClick={() => void copy(provider.examples[language], 'example')}>
                {copied === 'example' ? <Check size={14} /> : <Copy size={14} />}{!isAvailable ? providerDisplay.badgeLabel : copied === 'example' ? 'Copied' : copyError === 'example' ? 'Copy failed' : 'Copy code'}
              </button>
            </div>
            <pre id={`language-panel-${language}`} role="tabpanel" aria-labelledby={`language-tab-${language}`} tabIndex={0} className="integration-code"><code>{provider.examples[language]}</code></pre>
          </div>
        </details>
      </div>
    </Card>

    <div className="integration-support-grid">
      <Card className="codex-integration-card">
        <header><span><CodexIcon size={18} /></span><div><h2>Codex WebSocket</h2><p>Route Codex Responses through kineticRouter.</p></div></header>
        <details className="codex-config-disclosure">
          <summary><span>Configuration</span><span>~/.codex/config.toml</span><ChevronDown size={15} /></summary>
          <pre className="codex-code" tabIndex={0}><code>{codexConfig}</code></pre>
        </details>
        <div className="codex-actions">
          <button type="button" onClick={() => void copy(codexConfig, 'codex')}>{copied === 'codex' ? <Check size={14} /> : <Copy size={14} />}{copied === 'codex' ? 'Copied' : copyError === 'codex' ? 'Copy failed' : 'Copy config'}</button>
          <a className="integration-guide-link" href={publicSiteHref('/docs/integrations/codex/websocket')} target="_blank" rel="noreferrer">View tutorial <ExternalLink size={14} /></a>
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
