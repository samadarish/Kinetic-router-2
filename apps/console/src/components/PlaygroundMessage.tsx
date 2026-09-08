import { memo, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, ChevronDown, Copy } from 'lucide-react';
import type { ConversationMessage } from '../lib/playground-state';

const plugins = [remarkGfm];
const components: Components = {
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img: ({ alt }) => <span className="playground-message-meta">[Image{alt ? `: ${alt}` : ''}]</span>,
  table: ({ children }) => <div className="playground-table-scroll"><table>{children}</table></div>,
};

export const PlaygroundMessage = memo(function PlaygroundMessage({ message, userLabel = 'You', usageDisplay = 'inline' }: { message: ConversationMessage; userLabel?: string; usageDisplay?: 'inline' | 'details' }) {
  const [copiedContent, setCopiedContent] = useState<string>();
  const copied = copiedContent === message.content;
  const [copyError, setCopyError] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(message.content); setCopiedContent(message.content); setCopyError(false); }
    catch { setCopyError(true); }
  }
  const usage = message.usage && <p className="playground-message-meta">{message.usage.inputTokens.toLocaleString()} input · {message.usage.outputTokens.toLocaleString()} output · {message.usage.totalTokens.toLocaleString()} total tokens</p>;
  return <article className={`playground-message playground-message-${message.role}`} data-message-id={message.id}>
    <div className="playground-message-heading"><strong>{message.role === 'user' ? userLabel : message.model ?? 'Model'}</strong>
      {message.role === 'assistant' && message.content && <button type="button" onClick={() => void copy()} aria-label={copied ? 'Response copied' : 'Copy response'}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>}
    </div>
    {message.content ? <div className={`playground-message-text ${message.role === 'assistant' ? 'playground-markdown' : ''}`}>
      {message.role === 'assistant' ? <Markdown remarkPlugins={plugins} skipHtml components={components}>{message.content}</Markdown> : message.content}
    </div> : message.state ? message.state === 'complete' && <p className="playground-message-meta">No text returned.</p> : <span className="playground-typing" aria-hidden="true"><i /><i /><i /></span>}
    {usage && (usageDisplay === 'details' ? <details className="playground-message-details"><summary>Details <ChevronDown size={12} /></summary>{usage}</details> : usage)}
    {message.state === 'stopped' && <p className="playground-message-meta">Stopped</p>}
    {message.state === 'failed' && <p className="playground-message-meta">{message.content ? 'Response interrupted' : 'Request failed before a reply was received'}</p>}
    {message.limited && <p className="playground-message-meta">Output limit reached</p>}
    {copyError && <p className="playground-message-meta" role="status">Select the response text to copy it.</p>}
  </article>;
});
