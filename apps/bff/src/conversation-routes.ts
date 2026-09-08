import { z } from 'zod';
import type { Context, Hono } from 'hono';
import { conversationCreateSchema, conversationIdSchema, conversationImportSchema } from '@kineticrouter/portal-contract';
import { adminConversation, publicConversation, publicTurn, type ConversationStore, type Owner } from './conversations.js';

const querySchema = z.object({ cursor: z.string().max(128).optional(), search: z.string().max(200).optional(), model: z.string().max(200).optional(), deleted: z.enum(['all', 'active', 'deleted']).optional(), start: z.iso.date().optional(), end: z.iso.date().optional() }).strict();
const detailQuery = z.object({ before: z.coerce.number().int().positive().max(2147483647).optional() }).strict();
export function installConversationRoutes(app: Hono<any>, store: ConversationStore, owner: (c: Context) => Owner, abort: (id: string) => void) {
  const success = (c: Context, data: unknown) => c.json({ ok: true, data, requestId: c.get('requestId') });
  app.get('/portal/v1/playground/conversations', async c => {
    const page = await store.list(owner(c).id, querySchema.parse(c.req.query()));
    return success(c, { items: page.items.map(publicConversation), nextCursor: page.nextCursor });
  });
  app.post('/portal/v1/playground/conversations', async c => { const input = conversationCreateSchema.parse(await c.req.json()); return success(c, publicConversation(await store.create(owner(c), input.id))); });
  app.post('/portal/v1/playground/conversations/import', async c => { const input = conversationImportSchema.parse(await c.req.json()); return success(c, publicConversation(await store.create(owner(c), input.id, input))); });
  app.get('/portal/v1/playground/conversations/:id', async c => {
    const data = await store.detail(owner(c).id, conversationIdSchema.parse(c.req.param('id')), detailQuery.parse(c.req.query()).before);
    return success(c, { conversation: publicConversation(data.conversation), turns: data.turns.map(publicTurn), nextBefore: data.nextBefore });
  });
  app.delete('/portal/v1/playground/conversations/:id', async c => { const id = conversationIdSchema.parse(c.req.param('id')); await store.remove(owner(c).id, id); abort(id); return success(c, { removed: true }); });
  app.get('/portal/v1/admin/playground/conversations', async c => {
    const page = await store.list(null, querySchema.parse(c.req.query())); await store.audit(owner(c).id, 'list');
    return success(c, { items: page.items.map(adminConversation), nextCursor: page.nextCursor });
  });
  app.get('/portal/v1/admin/playground/conversations/:id', async c => {
    const id = conversationIdSchema.parse(c.req.param('id'));
    const data = await store.detail(null, id, detailQuery.parse(c.req.query()).before); await store.audit(owner(c).id, 'inspect', id);
    return success(c, { conversation: adminConversation(data.conversation), turns: data.turns.map(publicTurn), nextBefore: data.nextBefore });
  });
  app.delete('/portal/v1/admin/playground/conversations/:id', async c => { const id = conversationIdSchema.parse(c.req.param('id')); await store.purge(owner(c).id, id); abort(id); return success(c, { deleted: true }); });
}
