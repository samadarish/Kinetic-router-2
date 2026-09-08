import { z } from 'zod';
import { playgroundKeyIdSchema, playgroundModelSchema, type PlaygroundUsage } from './playground.js';

export const conversationIdSchema = z.string().uuid();
export const conversationCreateSchema = z.object({ id: conversationIdSchema }).strict();
export const playgroundTurnSchema = z.object({
  conversationId: conversationIdSchema, revision: z.number().int().nonnegative(), clientTurnId: conversationIdSchema,
  apiKeyId: playgroundKeyIdSchema, model: playgroundModelSchema, message: z.string().min(1).max(32_000).refine(value => Boolean(value.trim())),
}).strict();
export type PlaygroundTurnInput = z.infer<typeof playgroundTurnSchema>;
export const conversationImportSchema = z.object({
  id: conversationIdSchema,
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1_000_000), model: playgroundModelSchema.optional() }).strict()).min(1).max(40),
}).strict().refine(input => input.messages.every((message, index) => message.role === (index % 2 ? 'assistant' : 'user')), { message: 'Import a user/assistant conversation.' });
export type ConversationImportInput = z.infer<typeof conversationImportSchema>;
export type Conversation = {
  id: string; title: string; revision: number; createdAt: string; updatedAt: string; turnCount: number;
  selectedKey: string | null; selectedModel: string | null; active: boolean;
};
export type AdminConversation = Conversation & { ownerId: string; ownerLabel: string; deletedAt: string | null; imported: boolean };
export type ConversationTurn = {
  id: string; sequence: number; userText: string; assistantText: string; model: string | null;
  state: 'receiving' | 'complete' | 'stopped' | 'failed'; createdAt: string; finishedAt: string | null;
  usage: PlaygroundUsage | null; firstTextMs: number | null; durationMs: number | null; limited: boolean;
};
export type ConversationPage<T = Conversation> = { items: T[]; nextCursor: string | null };
export type ConversationDetail<T = Conversation> = { conversation: T; turns: ConversationTurn[]; nextBefore: number | null };
