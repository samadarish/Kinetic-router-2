import { z } from 'zod';

export const playgroundKeyIdSchema = z.string().regex(/^[1-9]\d{0,18}$/);
export const playgroundModelSchema = z.string().trim().min(1).max(200).refine(value => !/[\x00-\x1f\x7f]/.test(value));
export const playgroundMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(32_000),
}).strict();
export const playgroundChatSchema = z.object({
  apiKeyId: playgroundKeyIdSchema,
  model: playgroundModelSchema,
  messages: z.array(playgroundMessageSchema).min(1).max(40),
}).strict().refine(value => value.messages.at(-1)?.role === 'user', { message: 'End with a user message.' });

export type PlaygroundChatInput = z.infer<typeof playgroundChatSchema>;
export type PlaygroundMessage = z.infer<typeof playgroundMessageSchema>;
export type PlaygroundModel = { id: string; name: string };
export type PlaygroundKeyOption = { id: string; name: string };
export const playgroundModelIdentitySchema = z.object({
  modelId: playgroundModelSchema,
  name: z.string().regex(/^[^\p{Cc}\p{Zl}\p{Zp}]*$/u, 'Use a single-line identity name.').trim().min(1).max(80).optional(),
  knowledgeCutoff: z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, 'Use a valid month and year.').optional(),
}).strict().refine(value => value.name !== undefined || value.knowledgeCutoff !== undefined, { message: 'Provide an identity name or knowledge cutoff.' });
export type PlaygroundModelIdentity = z.infer<typeof playgroundModelIdentitySchema>;
const modelIdentitiesSchema = z.array(playgroundModelIdentitySchema).max(500)
  .refine(values => new Set(values.map(value => value.modelId)).size === values.length, { message: 'Identity model IDs must be unique.' });

// Updates distinguish omission (legacy clients preserve identities) from [] (clear).
export const playgroundSettingsUpdateSchema = z.object({
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  enabledModelIds: z.array(playgroundModelSchema).max(500).refine(ids => new Set(ids).size === ids.length, { message: 'Model IDs must be unique.' }),
  modelIdentities: modelIdentitiesSchema.optional(),
  playgroundEnabled: z.boolean().optional(),
}).strict();
export type PlaygroundSettingsUpdate = z.infer<typeof playgroundSettingsUpdateSchema>;
export const playgroundSettingsSchema = playgroundSettingsUpdateSchema.extend({ modelIdentities: modelIdentitiesSchema.default([]), playgroundEnabled: z.boolean().default(true) });
export type PlaygroundSettings = z.infer<typeof playgroundSettingsSchema>;
export type PlaygroundUsage = { inputTokens: number; outputTokens: number; totalTokens: number };
export type PlaygroundEvent =
  | { type: 'turn_started'; conversationId: string; turnId: string; sequence: number; revision: number; includedTurns: number; omittedTurns: number }
  | { type: 'text_delta'; text: string }
  | { type: 'usage'; usage: PlaygroundUsage }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'content_filter' | 'other' }
  | { type: 'error'; code: string; message: string };
export type ModelPrice =
  | { status: 'available'; model: string; currency: 'USD'; unit: 'million_tokens'; input: string; output: string; cacheRead?: string; cacheWrite?: string; observedAt: string }
  | { status: 'unavailable'; model: string; message: string };

// Validate the public SSE contract again in the browser. Unknown upstream fields
// are never a supported way to extend this interface.
export const playgroundEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('turn_started'), conversationId: z.string().uuid(), turnId: z.string().uuid(), sequence: z.number().int().positive(), revision: z.number().int().nonnegative(), includedTurns: z.number().int().nonnegative(), omittedTurns: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('text_delta'), text: z.string() }).strict(),
  z.object({ type: z.literal('usage'), usage: z.object({
    inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative(),
  }).strict() }).strict(),
  z.object({ type: z.literal('done'), finishReason: z.enum(['stop', 'length', 'content_filter', 'other']) }).strict(),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }).strict(),
]);
