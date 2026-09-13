/** Browser access and cleanup stay independent of transcript validation. */
export type PlaygroundStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const PLAYGROUND_STORAGE_KEY = 'kineticrouter-playground-v1';
export const CHAT_DRAFTS_KEY = 'kineticrouter-playground-drafts-v2';

export function browserPlaygroundStorage(): PlaygroundStorage | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

export function clearPlaygroundStorage(storage: PlaygroundStorage | undefined) {
  try { storage?.removeItem(PLAYGROUND_STORAGE_KEY); } catch { /* Storage may be disabled. */ }
}

export function clearAllPlaygroundStorage(storage: PlaygroundStorage | undefined) {
  clearPlaygroundStorage(storage);
  try { storage?.removeItem(CHAT_DRAFTS_KEY); } catch { /* Storage may be disabled. */ }
}
