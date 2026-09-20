import { z } from 'zod';

export type SupportStatus = 'open' | 'resolved';
export type SupportSender = 'customer' | 'admin';
export type SupportPresenceMode = 'automatic' | 'online' | 'away' | 'offline';
export const SUPPORT_LANGUAGE_CODES = ['en', 'de', 'ja', 'zh', 'ko', 'fr', 'es', 'vi'] as const;
export type SupportLanguage = typeof SUPPORT_LANGUAGE_CODES[number];
export const SUPPORT_LANGUAGE_LABELS: Record<SupportLanguage, string> = {
  en: 'English', de: 'German', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', fr: 'French', es: 'Spanish', vi: 'Vietnamese',
};
export type SupportPresence = { status: 'online' | 'away' | 'offline'; mode?: SupportPresenceMode; statusText?: string; lastSeenAt?: string | null };
export type SupportImage = { url: string; mimeType: 'image/webp'; width: number; height: number; byteSize: number };
export type SupportMessage = { id: string; ticketId: string; sequence: number; sender: SupportSender; body: string; createdAt: string; image?: SupportImage; kind?: 'welcome' };
export type SupportTicket = {
  id: string; subject: string; status: SupportStatus; createdAt: string; updatedAt: string;
  preferredLanguage: SupportLanguage;
  kind?: 'welcome';
  lastMessage: string; lastSender: SupportSender; messageCount: number; unreadCount: number;
  /** These fields are returned only to an administrator. */
  ownerId?: string; ownerLabel?: string; ownerEmail?: string; customerReadSequence?: number; customerReadAt?: string | null;
};
export type SupportTicketPage = { items: SupportTicket[]; total: number; unreadCount: number };
export type SupportDetail = { ticket: SupportTicket; messages: SupportMessage[]; nextBefore: number | null };
export type SupportWelcomeResult = { ticket: SupportTicket; message: SupportMessage; created: boolean };
export type SupportWelcomeRecipient = {
  ticketId: string; ownerId: string; ownerLabel: string; ownerEmail: string;
  sentAt: string; firstViewedAt: string | null; firstReplyAt: string | null;
};
export type SupportWelcomePage = { items: SupportWelcomeRecipient[]; total: number };
export type SupportEvent = {
  type: 'ready' | 'message' | 'tickets' | 'read' | 'presence';
  ticketId?: string; message?: SupportMessage; presence?: SupportPresence;
};
export const supportCreateSchema = z.object({
  clientTicketId: z.string().uuid(), clientMessageId: z.string().uuid(),
  subject: z.string().trim().min(1).max(160), message: z.string().trim().max(10000),
  preferredLanguage: z.enum(SUPPORT_LANGUAGE_CODES).default('en'),
});
// A blank body is permitted only with a validated image; the support store enforces that invariant.
export const supportReplySchema = z.object({ clientMessageId: z.string().uuid(), message: z.string().trim().max(10000) });
export const supportReadSchema = z.object({ sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) });
export const supportStatusSchema = z.object({ status: z.enum(['open', 'resolved']) });
export const supportPresenceSchema = z.object({
  mode: z.enum(['automatic', 'online', 'away', 'offline']).optional(),
  statusText: z.string().trim().max(160).optional(),
}).refine(value => value.mode !== undefined || value.statusText !== undefined, 'Choose an availability or status message.');
export const supportHeartbeatSchema = z.object({ tabId: z.string().uuid(), active: z.boolean() });
export const supportListSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  search: z.string().trim().max(160).default(''), status: z.enum(['open', 'resolved', 'all']).default('all'),
});
export const supportWelcomeListSchema = supportListSchema.pick({ page: true, search: true });
export type SupportPresenceUpdate = z.infer<typeof supportPresenceSchema>;
export type SupportWelcomeQuery = z.infer<typeof supportWelcomeListSchema>;
export type SupportCreateInput = z.input<typeof supportCreateSchema>;
export type SupportReplyInput = z.infer<typeof supportReplySchema>;
export type SupportListQuery = z.infer<typeof supportListSchema>;
