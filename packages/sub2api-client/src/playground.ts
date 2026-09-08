import type { ModelPrice, PlaygroundChatInput, PlaygroundEvent, PlaygroundModel } from '@kineticrouter/portal-contract';
import { Sub2ApiError, asRecord, arrayValue } from './index.js';

export type OwnedPlaygroundKey = { id: string; key: string; groupId: string };
/** BFF-owned options, separate from the strict customer request contract. */
export type PlaygroundRequestOptions = { systemPrompt?: string };
export interface PlaygroundGateway {
  models(key: string, signal?: AbortSignal): Promise<PlaygroundModel[]>;
  billing(key: string, signal?: AbortSignal): Promise<unknown>;
  chat(key: string, input: PlaygroundChatInput, signal: AbortSignal, options?: PlaygroundRequestOptions): Promise<AsyncIterable<PlaygroundEvent>>;
}

export function readOwnedPlaygroundKey(value: unknown, userId: string, requestedId: string, now = Date.now()): OwnedPlaygroundKey {
  const raw = asRecord(value);
  if (String(raw.id) !== requestedId || String(raw.user_id) !== userId) {
    throw new Sub2ApiError({ status: 404, code: 'KEY_NOT_FOUND', message: 'The selected API key was not found.' });
  }
  const expiresAt = typeof raw.expires_at === 'string' ? Date.parse(raw.expires_at) : undefined;
  if (raw.status !== 'active' || (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= now))) {
    throw new Sub2ApiError({ status: 400, code: 'KEY_UNAVAILABLE', message: 'Choose an active API key that has not expired.' });
  }
  if (typeof raw.key !== 'string' || !raw.key || !/^[1-9]\d*$/.test(String(raw.group_id))) {
    throw new Sub2ApiError({ status: 400, code: 'KEY_UNAVAILABLE', message: 'Choose an API key assigned to a group.' });
  }
  return { id: requestedId, key: raw.key, groupId: String(raw.group_id) };
}

type GatewayFailure = 'http' | 'network' | 'response';

/** Only locally authored messages and diagnostic categories, never upstream bodies. */
export class PlaygroundGatewayError extends Error {
  readonly status: number;
  readonly code: string;
  readonly upstreamStatus?: number;
  readonly failure: GatewayFailure;

  constructor(status: number, failure: GatewayFailure = 'http') {
    const messages: Record<number, string> = {
      400: 'The model could not accept this request.', 401: 'The selected API key could not authenticate.',
      402: 'This key has insufficient credit for the request.', 403: 'This request is not allowed for the selected key. Check its access and IP restrictions.',
      404: 'This model or endpoint is unavailable.', 429: 'The selected key or model is at its request limit. Try again later.',
    };
    super(failure === 'network' ? 'The model service could not be reached. Try again shortly.'
      : failure === 'response' ? 'The model service returned an unreadable response. Try again or choose another model.'
      : messages[status] ?? 'The model service could not complete this request. Try again shortly or choose another model.');
    this.name = 'PlaygroundGatewayError';
    // A gateway API-key rejection is separate from the console login session.
    this.status = status === 401 ? 403 : status >= 400 && status < 500 ? status : 502;
    this.code = status === 401 ? 'PLAYGROUND_KEY_REJECTED' : 'PLAYGROUND_REQUEST_FAILED';
    this.upstreamStatus = failure === 'http' ? status : undefined;
    this.failure = failure;
  }
}

const gatewayError = (status: number, failure: GatewayFailure = 'response') => new PlaygroundGatewayError(status, failure);

export class PlaygroundClient implements PlaygroundGateway {
  private readonly baseUrl: string;
  constructor(baseUrl: string, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('A fixed HTTPS inference base URL is required.');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request(path: string, key: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    try {
      const response = await this.fetcher(`${this.baseUrl}/${path}`, {
        ...init, headers: { Authorization: `Bearer ${key}`, Accept: path === 'chat/completions' ? 'text/event-stream' : 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        redirect: 'manual', signal: signal ?? AbortSignal.timeout(12_000),
      });
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw gatewayError(response.status, 'http'); }
      return response;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof PlaygroundGatewayError) throw error;
      throw gatewayError(502, 'network');
    }
  }

  async models(key: string, signal?: AbortSignal): Promise<PlaygroundModel[]> {
    const response = await this.request('models', key, {}, signal);
    const raw = asRecord(await response.json().catch(() => null));
    if (!Array.isArray(raw.data)) throw gatewayError(502);
    const seen = new Set<string>();
    return raw.data.flatMap(value => {
      const item = asRecord(value);
      if (typeof item.id !== 'string' || !item.id || item.id.length > 200 || /[\x00-\x1f\x7f]/.test(item.id) || seen.has(item.id)) return [];
      seen.add(item.id);
      // Model labels are the requested model IDs; internal reasoning manifests
      // and provider-specific model metadata are deliberately not serialized.
      return [{ id: item.id, name: item.id }];
    });
  }

  async billing(key: string, signal?: AbortSignal): Promise<unknown> {
    const response = await this.request('sub2api/billing', key, {}, signal);
    return response.json();
  }

  async chat(key: string, input: PlaygroundChatInput, signal: AbortSignal, options?: PlaygroundRequestOptions): Promise<AsyncIterable<PlaygroundEvent>> {
    const messages = [
      ...(options?.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
      ...input.messages.map(message => ({ role: message.role, content: message.content })),
    ];
    const response = await this.request('chat/completions', key, {
      method: 'POST', body: JSON.stringify({ model: input.model, messages, stream: true, stream_options: { include_usage: true }, max_completion_tokens: 8192 }),
    }, signal);
    if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
      await response.body?.cancel().catch(() => {}); throw gatewayError(502);
    }
    return publicChatEvents(response.body, signal);
  }
}

async function* sseData(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let data: string[] = [];
  let dataSize = 0;
  const cancel = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const chunk = await reader.read();
      signal.throwIfAborted();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 256 * 1024) throw gatewayError(502);
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') { if (data.length) yield data.join('\n'); data = []; dataSize = 0; }
        else if (line.startsWith('data:')) {
          const value = line.slice(5).replace(/^ /, '');
          dataSize += value.length;
          if (dataSize > 256 * 1024) throw gatewayError(502);
          data.push(value);
        }
      }
      if (chunk.done) return; // Unterminated frames are never presented as complete.
    }
  } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function* publicChatEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<PlaygroundEvent> {
  let finishReason: 'stop' | 'length' | 'content_filter' | 'other' | undefined;
  for await (const data of sseData(body, signal)) {
    if (data === '[DONE]') {
      if (!finishReason) throw gatewayError(502);
      yield { type: 'done', finishReason };
      return;
    }
    let raw: Record<string, unknown>;
    try { raw = asRecord(JSON.parse(data)); } catch { throw gatewayError(502); }
    if (raw.error || raw.type === 'error') throw gatewayError(502);
    const choice = asRecord(arrayValue(raw.choices).find(value => asRecord(value).index === 0));
    const delta = asRecord(choice.delta);
    if (typeof delta.content === 'string' && delta.content) yield { type: 'text_delta', text: delta.content };
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      finishReason = ['stop', 'length', 'content_filter'].includes(String(choice.finish_reason)) ? choice.finish_reason as 'stop' | 'length' | 'content_filter' : 'other';
    }
    const usage = asRecord(raw.usage);
    const counts = [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens];
    if (counts.every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) {
      yield { type: 'usage', usage: { inputTokens: counts[0] as number, outputTokens: counts[1] as number, totalTokens: counts[2] as number } };
    }
  }
  throw gatewayError(502);
}

export function unavailableModelPrice(model: string): ModelPrice {
  return { status: 'unavailable', model, message: 'Current model prices are unavailable. Actual billed costs remain available in Usage.' };
}

// v0.1.183 model-plaza token pricing is in USD/token and uses the gateway's
// context-price schedule. We only display fully resolved, flat token prices.
// This adapter formats a quote; it never computes or writes a usage charge.
export function publicModelPrice(plazaValue: unknown, billingValue: unknown, key: OwnedPlaygroundKey, model: string): ModelPrice {
  const unavailable = unavailableModelPrice(model);
  const groups = arrayValue(asRecord(plazaValue).groups).map(asRecord).filter(group => String(group.id) === key.groupId);
  if (groups.length !== 1) return unavailable;
  const group = groups[0]!;
  const models = arrayValue(group.models).map(asRecord).filter(item => item.name === model);
  if (models.length !== 1) return unavailable;
  const item = models[0]!;
  const pricing = asRecord(item.pricing);
  const billing = asRecord(billingValue);
  if (billing.object !== 'sub2api.key_billing' || billing.schema_version !== 1 || billing.billing_scope !== 'token'
    || billing.peak_rate_enabled !== false || group.peak_rate_enabled !== false
    || pricing.billing_mode !== 'token' || !Array.isArray(pricing.intervals) || pricing.intervals.length !== 0
    || item.long_context_basis || item.time_pricing || group.platform !== 'openai' || item.platform !== 'openai') return unavailable;
  const observedAt = typeof billing.observed_at === 'string' ? billing.observed_at : '';
  if (!Number.isFinite(Date.parse(observedAt))) return unavailable;
  const multiplier = decimal(billing.effective_rate_multiplier);
  const input = decimal(pricing.input_price);
  const output = decimal(pricing.output_price);
  if (!multiplier || !input || !output) return unavailable;
  const optionalPrice = (value: unknown) => {
    const parsed = decimal(value);
    return parsed ? multiply(parsed, multiplier, 6) : undefined;
  };
  return { status: 'available', model, currency: 'USD', unit: 'million_tokens', input: multiply(input, multiplier, 6), output: multiply(output, multiplier, 6),
    cacheRead: optionalPrice(pricing.cache_read_price), cacheWrite: optionalPrice(pricing.cache_write_price), observedAt };
}

type Decimal = { coefficient: bigint; scale: number };
function decimal(value: unknown): Decimal | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const source = String(value);
  if (source.length > 80) return undefined;
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(source);
  if (!match) return undefined;
  const exponent = Number(match[3] ?? 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 30) return undefined;
  return { coefficient: BigInt(match[1]! + (match[2] ?? '')), scale: (match[2]?.length ?? 0) - exponent };
}
function multiply(a: Decimal, b: Decimal, unitExponent: number): string {
  const value = (a.coefficient * b.coefficient).toString();
  const scale = a.scale + b.scale - unitExponent;
  if (scale <= 0) return value === '0' ? '0' : value + '0'.repeat(-scale);
  const padded = value.padStart(scale + 1, '0');
  return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`.replace(/\.?0+$/, '') || '0';
}
