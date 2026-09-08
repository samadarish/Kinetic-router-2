import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { playgroundTurnSchema, playgroundKeyIdSchema, playgroundModelSchema, playgroundSettingsUpdateSchema, type PlaygroundEvent, type PlaygroundSettings } from '@kineticrouter/portal-contract';
import { asRecord, mapPaginated, publicModelPrice, readOwnedPlaygroundKey, unavailableModelPrice, Sub2ApiError, type PlaygroundGateway } from '@kineticrouter/sub2api-client';
import { PlaygroundCatalog } from './playground-catalog.js';
import type { PlaygroundSettingsStore } from './playground-settings.js';
import { playgroundIdentityInstruction } from './playground-identity.js';
import { installConversationRoutes } from './conversation-routes.js';
import { ConversationError, recentContext, type ConversationStore, type Owner, type TurnUpdate } from './conversations.js';

export type PlaygroundRouteOptions = {
  accountRequest(c: Context, path: string): Promise<unknown>;
  getUserId(c: Context): string;
  getOwner(c: Context): Owner;
  history: ConversationStore;
  client: PlaygroundGateway;
  settings: PlaygroundSettingsStore;
  modelPricesEnabled(): Promise<boolean>;
};

/** Install after the application's session, Origin and CSRF middleware. */
export function installPlaygroundRoutes(app: Hono<any>, options: PlaygroundRouteOptions) {
  const ownedKey = async (c: Context, id: string) => readOwnedPlaygroundKey(
    await options.accountRequest(c, `keys/${encodeURIComponent(id)}`), options.getUserId(c), id,
  );
  const success = (c: Context, data: unknown) => c.json({ ok: true, data, requestId: c.get('requestId') });
  const catalog = new PlaygroundCatalog(options.client);
  const active = new Map<string, AbortController>();
  app.use('/portal/v1/playground/*', async (c, next) => {
    const settings = await options.settings.read();
    if (!settings.playgroundEnabled) throw new Sub2ApiError({ status: 403, code: 'PLAYGROUND_DISABLED', message: 'Playground is currently disabled.' });
    c.set('playgroundSettings', settings);
    await next();
  });
  installConversationRoutes(app, options.history, options.getOwner, id => active.get(id)?.abort());
  const discoverySignal = (c: Context) => AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(12_000)]);

  const listKeys = async (c: Context) => {
    const page = pagination(c.req.query('page'), 1, 100_000);
    const pageSize = pagination(c.req.query('pageSize'), 30, 100);
    const raw = await options.accountRequest(c, `keys?${new URLSearchParams({ page: String(page), page_size: String(pageSize), status: 'active', sort_by: 'created_at', sort_order: 'desc' })}`);
    const result = mapPaginated(raw, value => {
      const key = asRecord(value);
      if (!playgroundKeyIdSchema.safeParse(String(key.id)).success) return null;
      try { readOwnedPlaygroundKey(key, options.getUserId(c), String(key.id)); }
      catch { return null; }
      return { id: String(key.id), name: typeof key.name === 'string' ? key.name : 'API key' };
    });
    return success(c, { items: result.items.filter(item => item !== null), total: result.total, page: result.page, pageSize: result.pageSize, pages: result.pages });
  };
  app.get('/portal/v1/playground/keys', listKeys);
  app.get('/portal/v1/admin/playground/keys', listKeys);

  const publicSettings = (settings: PlaygroundSettings) => ({
    revision: settings.revision, enabledModelIds: [...settings.enabledModelIds],
    playgroundEnabled: settings.playgroundEnabled,
    modelIdentities: settings.modelIdentities.map(identity => ({ modelId: identity.modelId, name: identity.name, knowledgeCutoff: identity.knowledgeCutoff })),
  });
  app.get('/portal/v1/admin/playground/settings', async c => success(c, publicSettings(await options.settings.read())));
  app.put('/portal/v1/admin/playground/settings', async c => {
    const input = playgroundSettingsUpdateSchema.parse(await c.req.json());
    const settings = await options.settings.save(input);
    return success(c, publicSettings(settings));
  });
  app.get('/portal/v1/admin/playground/models', async c => {
    const id = playgroundKeyIdSchema.parse(c.req.query('apiKeyId'));
    const key = await ownedKey(c, id);
    return success(c, await catalog.models(options.getUserId(c), key, discoverySignal(c)));
  });

  app.get('/portal/v1/playground/models', async c => {
    const id = playgroundKeyIdSchema.parse(c.req.query('apiKeyId'));
    const key = await ownedKey(c, id);
    const settings = c.get('playgroundSettings') as PlaygroundSettings;
    if (!settings.enabledModelIds.length) return success(c, []);
    const models = await catalog.models(options.getUserId(c), key, discoverySignal(c));
    return success(c, models.filter(model => settings.enabledModelIds.includes(model.id)));
  });

  app.get('/portal/v1/model-prices', async c => {
    const id = playgroundKeyIdSchema.parse(c.req.query('apiKeyId'));
    const model = playgroundModelSchema.parse(c.req.query('model'));
    const key = await ownedKey(c, id);
    try {
      if (!await options.modelPricesEnabled()) return success(c, unavailableModelPrice(model));
      const [plaza, billing] = await Promise.all([
        options.accountRequest(c, 'model-plaza'),
        options.client.billing(key.key, AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(12_000)])),
      ]);
      return success(c, publicModelPrice(plaza, billing, key, model));
    } catch { return success(c, unavailableModelPrice(model)); }
  });

  app.post('/portal/v1/playground/chat', async c => {
    const raw = await c.req.json();
    if (raw && typeof raw === 'object' && 'messages' in raw) throw new ConversationError(409, 'PLAYGROUND_UPDATE_REQUIRED', 'Refresh the console to use saved conversations.');
    const input = playgroundTurnSchema.parse(raw);
    const key = await ownedKey(c, input.apiKeyId);
    const settings = c.get('playgroundSettings') as PlaygroundSettings;
    if (!settings.enabledModelIds.includes(input.model)) throw new Sub2ApiError({ status: 400, code: 'MODEL_UNAVAILABLE', message: 'This model is not enabled for Playground. Choose another model.' });
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, c.req.raw.signal, AbortSignal.timeout(120_000)]);
    const models = await catalog.models(options.getUserId(c), key, signal);
    if (!models.some(model => model.id === input.model)) throw new Sub2ApiError({ status: 400, code: 'MODEL_UNAVAILABLE', message: 'Choose a model available to this API key.' });
    const systemPrompt = playgroundIdentityInstruction(settings.modelIdentities.find(identity => identity.modelId === input.model));
    recentContext([], input, systemPrompt);
    const started = await options.history.begin(options.getUserId(c), input);
    const context = recentContext(started.history, input, systemPrompt);
    active.set(input.conversationId, controller);
    const began = performance.now();
    const progress: TurnUpdate = { assistantText: '', usage: null, firstTextMs: null, durationMs: null, limited: false, state: 'receiving' };
    let pending: Promise<boolean> | undefined;
    let saveFailed = false;
    let version = 0, savedVersion = 0, savedAt = performance.now();
    const storageError = () => ({ type: 'error', code: 'HISTORY_UNAVAILABLE', message: 'The response could not be fully saved. Reload the conversation before trying again.' });
    const persist = async () => {
      if (pending) await pending;
      const snapshot = { ...progress, usage: progress.usage ? { ...progress.usage } : null, durationMs: Math.round(performance.now() - began) };
      const writingVersion = version;
      const write = options.history.write(started.turn, snapshot); pending = write;
      try { const kept = await write; savedVersion = writingVersion; savedAt = performance.now(); if (!kept) controller.abort(); return kept; }
      catch (error) { saveFailed = true; throw error; }
      finally { if (pending === write) pending = undefined; }
    };
    const checkpoint = setInterval(() => {
      if (!pending && progress.state === 'receiving' && (version !== savedVersion || performance.now() - savedAt >= 15_000)) void persist().catch(() => controller.abort());
    }, 1000);
    let events: AsyncIterable<PlaygroundEvent>;
    try { events = await options.client.chat(key.key, context.input, signal, systemPrompt ? { systemPrompt } : undefined); }
    catch (error) {
      clearInterval(checkpoint); progress.state = signal.aborted ? 'stopped' : 'failed';
      try { await persist(); } finally { if (active.get(input.conversationId) === controller) active.delete(input.conversationId); controller.abort(); }
      throw error;
    }
    c.header('X-Accel-Buffering', 'no');
    const response = streamSSE(c, async stream => {
      let disconnected = false, finished = false;
      stream.onAbort(() => { disconnected = true; controller.abort(); });
      const keepalive = setInterval(() => { void stream.write(': keepalive\n\n').catch(() => controller.abort()); }, 15_000);
      try {
        await stream.writeSSE({ event: 'turn_started', data: JSON.stringify({ type: 'turn_started', conversationId: input.conversationId, turnId: started.turn.id, sequence: started.turn.sequence, revision: started.chat.revision, includedTurns: context.includedTurns, omittedTurns: started.chat.turnCount - 1 - context.includedTurns }) });
        for await (const event of events) {
          if (signal.aborted) break;
          if (event.type === 'text_delta') {
            if (progress.firstTextMs === null && event.text) progress.firstTextMs = Math.round(performance.now() - began);
            if (progress.assistantText.length + event.text.length > 1_000_000) throw new Error('Response exceeded limit');
            progress.assistantText += event.text;
            version++;
          }
          if (event.type === 'usage') { progress.usage = { inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens, totalTokens: event.usage.totalTokens }; version++; }
          if (event.type === 'error' || event.type === 'turn_started') throw new Error('Interrupted upstream response');
          if (event.type === 'done') {
            progress.state = 'complete'; progress.limited = event.finishReason === 'length';
            clearInterval(checkpoint);
            if (!await persist()) break;
            finished = true;
          }
          await stream.writeSSE({ event: event.type, data: JSON.stringify(publicStreamEvent(event)) });
          if (finished) break;
        }
        if (!finished && !disconnected && !c.req.raw.signal.aborted) {
          progress.state = 'failed';
          await stream.writeSSE({ event: 'error', data: JSON.stringify(saveFailed ? storageError() : interruptedEvent()) });
        }
      } catch {
        progress.state = 'failed';
        if (!disconnected && !c.req.raw.signal.aborted) await stream.writeSSE({ event: 'error', data: JSON.stringify(saveFailed ? storageError() : interruptedEvent()) }).catch(() => {});
      } finally {
        clearInterval(keepalive); clearInterval(checkpoint); controller.abort();
        if (!finished) {
          if (disconnected || c.req.raw.signal.aborted || progress.state === 'receiving') progress.state = 'stopped';
          await persist().catch(() => {});
        }
        if (active.get(input.conversationId) === controller) active.delete(input.conversationId);
      }
    });
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  });
}

function pagination(value: string | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > max) throw new Sub2ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Choose a valid page and page size.' });
  return Number(value);
}

function interruptedEvent(): PlaygroundEvent {
  return { type: 'error', code: 'STREAM_INTERRUPTED', message: 'The response was interrupted. Any billed usage remains available in Usage.' };
}

// Even injected or future gateway implementations must cross an allowlist here.
function publicStreamEvent(event: PlaygroundEvent): PlaygroundEvent {
  switch (event.type) {
    case 'turn_started': throw new Error('Unexpected gateway metadata');
    case 'text_delta': return { type: 'text_delta', text: event.text };
    case 'usage': return { type: 'usage', usage: { inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens, totalTokens: event.usage.totalTokens } };
    case 'done': return { type: 'done', finishReason: event.finishReason };
    case 'error': return interruptedEvent();
  }
}
