import type { SupportMessage } from '@kineticrouter/portal-contract';

export const SUPPORT_SOUND_URL = '/sounds/message-notification.mp3';
export const supportPreferenceKey = (userId: string) => `kinetic-support-alerts:${userId}`;
export function readSupportPreferences(userId: string, storage: Pick<Storage, 'getItem'> | undefined): { sound: boolean; desktop: boolean } {
  try {
    const value = JSON.parse(storage?.getItem(supportPreferenceKey(userId)) ?? '{}');
    return { sound: value?.sound !== false, desktop: value?.desktop === true };
  } catch { return { sound: true, desktop: false }; }
}
export function isIncomingSupportMessage(message: SupportMessage, admin: boolean) { return message.sender === (admin ? 'customer' : 'admin'); }

/** Short per-message locks avoid a suspended background tab owning a permanent leader lock. */
export async function claimSupportAlert(userId: string, messageId: string, run: () => Promise<void | boolean>, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, locks: Pick<LockManager, 'request'> | undefined, now = Date.now()) {
  const key = `kinetic-support-notified:${userId}`;
  const claim = async () => {
    let entries: { id: string; at: number }[] = [];
    try { entries = JSON.parse(storage?.getItem(key) ?? '[]'); if (!Array.isArray(entries)) entries = []; } catch { /* Empty ledger. */ }
    entries = entries.filter(entry => entry && typeof entry.id === 'string' && entry.at > now - 86400000);
    if (entries.some(entry => entry.id === messageId)) return false;
    if (await run() === false) return false;
    try { storage?.setItem(key, JSON.stringify([...entries.slice(-499), { id: messageId, at: now }])); } catch { /* In-memory event dedup still applies. */ }
    return true;
  };
  return locks ? locks.request(`kinetic-support-alert:${userId}`, claim) : claim();
}
