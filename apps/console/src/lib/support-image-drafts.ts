import type { PreparedSupportImage } from './support-images';

// Version 2 stores untouched original files. Older drafts contain canvas exports.
type ImageDraft = { version: 2; key: string; userId: string; image: PreparedSupportImage; updatedAt: number };
const memory = new Map<string, ImageDraft>();
const epochs = new Map<string, number>();
const revisions = new Map<string, number>();
const needsReattachment = new Map<string, string>();
let database: Promise<IDBDatabase> | undefined;
let fallbackTab = '';
let writes = Promise.resolve();

export class SupportImageDraftNeedsReattachmentError extends Error {
  constructor() { super('This saved image was prepared by an older version. Attach the original image again.'); }
}

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Local image storage is unavailable.')); return; }
    const request = indexedDB.open('kinetic-support-image-drafts', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('images', { keyPath: 'key' });
      store.createIndex('userId', 'userId');
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Local image storage is unavailable.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
  }).catch(error => { database = undefined; throw error; });
  return database;
}

function tabId() {
  try {
    const existing = sessionStorage.getItem('kinetic-support-image-tab');
    if (existing) return existing;
    const id = crypto.randomUUID(); sessionStorage.setItem('kinetic-support-image-tab', id); return id;
  } catch { return fallbackTab || (fallbackTab = crypto.randomUUID()); }
}

export function supportImageDraftKey(userId: string, draftKey: string) { return `${userId}:${tabId()}:${draftKey}`; }
export function supportImageDraftEpoch(userId: string) { return epochs.get(userId) ?? 0; }

export async function readSupportImageDraft(key: string, userId: string): Promise<PreparedSupportImage | null> {
  const epoch = supportImageDraftEpoch(userId);
  await writes;
  if (epoch !== supportImageDraftEpoch(userId)) return null;
  if (needsReattachment.get(key) === userId) throw new SupportImageDraftNeedsReattachmentError();
  const local = memory.get(key);
  if (local?.userId === userId) return local.image;
  const revision = revisions.get(key) ?? 0;
  try {
    const db = await openDatabase();
    const record = await new Promise<ImageDraft | undefined>((resolve, reject) => {
      const request = db.transaction('images', 'readonly').objectStore('images').get(key);
      request.onsuccess = () => resolve(request.result as ImageDraft | undefined);
      request.onerror = () => reject(request.error);
    });
    if (epoch !== supportImageDraftEpoch(userId)) return null;
    if (needsReattachment.get(key) === userId) throw new SupportImageDraftNeedsReattachmentError();
    if (revision !== (revisions.get(key) ?? 0)) {
      const current = memory.get(key);
      return current?.userId === userId ? current.image : null;
    }
    if (!record || record.userId !== userId || record.updatedAt < Date.now() - 7 * 86400000) return null;
    if (record.version !== 2) {
      const removed = writeSupportImageDraft(userId, key, null);
      needsReattachment.set(key, userId);
      await removed;
      throw new SupportImageDraftNeedsReattachmentError();
    }
    if (!(record.image.blob instanceof Blob)) return null;
    memory.set(key, record); return record.image;
  } catch (error) {
    if (error instanceof SupportImageDraftNeedsReattachmentError) throw error;
    return null;
  }
}

/** Keep writes ordered so remove/send/logout cannot be undone by a slower earlier save. */
export function writeSupportImageDraft(userId: string, key: string, image: PreparedSupportImage | null): Promise<boolean> {
  const epoch = supportImageDraftEpoch(userId);
  const record: ImageDraft = { version: 2, key, userId, image: image!, updatedAt: Date.now() };
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  needsReattachment.delete(key);
  if (image) memory.set(key, record); else memory.delete(key);
  const operation = writes.then(async () => {
    if (supportImageDraftEpoch(userId) !== epoch) return true;
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('images', 'readwrite');
        const store = transaction.objectStore('images');
        if (image) store.put(record); else store.delete(key);
        // Remove abandoned local drafts without touching persisted conversation images.
        const cursor = store.openCursor();
        cursor.onsuccess = () => { const value = cursor.result; if (!value) return; if ((value.value as ImageDraft).updatedAt < Date.now() - 7 * 86400000) value.delete(); value.continue(); };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return true;
    } catch { return false; }
  });
  writes = operation.then(() => {}, () => {});
  return operation;
}

export function clearSupportImageDrafts(userId: string): Promise<void> {
  epochs.set(userId, supportImageDraftEpoch(userId) + 1);
  for (const [key, record] of memory) if (record.userId === userId) memory.delete(key);
  for (const [key, owner] of needsReattachment) if (owner === userId) needsReattachment.delete(key);
  const operation = writes.then(async () => {
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('images', 'readwrite');
        const cursor = transaction.objectStore('images').index('userId').openCursor(IDBKeyRange.only(userId));
        cursor.onsuccess = () => { const value = cursor.result; if (!value) return; value.delete(); value.continue(); };
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
      });
    } catch { /* The in-memory copy is already cleared. */ }
  });
  writes = operation.catch(() => {}); return writes;
}
