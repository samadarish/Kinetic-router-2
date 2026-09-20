import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareSupportImage, supportImageDimensions, validateSupportImageFile, SUPPORT_IMAGE_MAX_SOURCE_BYTES, type PreparedSupportImage } from './support-images';
import { clearSupportImageDrafts, readSupportImageDraft, supportImageDraftEpoch, supportImageDraftKey, writeSupportImageDraft } from './support-image-drafts';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('customer image preparation', () => {
  it('limits upload sources before decoding and retains original dimensions', () => {
    expect(() => validateSupportImageFile({ size: 11 * 1024 * 1024, type: 'image/png' })).toThrow('10 MB');
    expect(() => validateSupportImageFile({ size: 200, type: 'image/svg+xml' })).toThrow('JPG');
    expect(() => validateSupportImageFile({ size: 0, type: 'image/jpeg' })).toThrow('empty');
    expect(() => validateSupportImageFile({ size: SUPPORT_IMAGE_MAX_SOURCE_BYTES, type: 'image/png' })).not.toThrow();
    expect(supportImageDimensions(3840, 2160)).toEqual({ width: 3840, height: 2160 });
    expect(supportImageDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(supportImageDimensions(1200, 2400)).toEqual({ width: 1200, height: 2400 });
    expect(() => supportImageDimensions(10000, 10000)).toThrow('megapixels');
    expect(() => supportImageDimensions(NaN, 100)).toThrow('megapixels');
    expect(() => supportImageDimensions(0, 100)).toThrow('megapixels');
  });

  function browser() {
    const close = vi.fn();
    const bitmap = { width: 2400, height: 1200, close };
    const createElement = vi.fn(() => { throw new Error('Canvas is blocked by browser privacy protection.'); });
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal('document', { createElement });
    return { bitmap, createElement, close };
  }
  it.each([['image/png', 'image.png'], ['image/jpeg', 'image.jpg'], ['image/webp', 'image.webp']])('keeps %s bytes unchanged without accessing canvas', async (type, name) => {
    const state = browser();
    const source = new File([new Uint8Array(600 * 1024).fill(73)], 'private-original-name.png', { type });
    const result = await prepareSupportImage(source);
    expect(result.blob).toBe(source);
    expect(await result.blob.arrayBuffer()).toEqual(await source.arrayBuffer());
    expect(result).toMatchObject({ width: 2400, height: 1200, name });
    expect(state.createElement).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });
  it('checks dimensions and releases a decoded image that exceeds the pixel limit', async () => {
    const state = browser(); state.bitmap.width = 8000; state.bitmap.height = 8000;
    await expect(prepareSupportImage(new File(['source'], 'large.jpg', { type: 'image/jpeg' }))).rejects.toThrow('megapixels');
    expect(state.close).toHaveBeenCalledOnce(); expect(state.createElement).not.toHaveBeenCalled();
  });
  it('uses an object URL only for decoding when ImageBitmap is unavailable and releases it', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('Image', class { src = ''; naturalWidth = 320; naturalHeight = 240; decode = async () => {}; });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:original');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const source = new File(['pixels'], 'original.png', { type: 'image/png' });
    expect(await prepareSupportImage(source)).toEqual({ blob: source, width: 320, height: 240, name: 'image.png' });
    expect(create).toHaveBeenCalledWith(source); expect(revoke).toHaveBeenCalledWith('blob:original');
  });
  it('reports invalid images without sending them', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode failed')));
    await expect(prepareSupportImage(new File(['invalid'], 'fake.jpg', { type: 'image/jpeg' }))).rejects.toThrow('could not be opened');
  });
});

describe('image drafts with unavailable browser persistence', () => {
  it('retains a bounded image for navigation, clears it after send, and reports that reload persistence failed', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const image = { blob: new Blob(['pixels'], { type: 'image/webp' }), width: 100, height: 50, name: 'image.webp' };
    const key = supportImageDraftKey('draft-user', 'ticket-one');
    expect(await writeSupportImageDraft('draft-user', key, image)).toBe(false);
    expect(await readSupportImageDraft(key, 'draft-user')).toEqual(image);
    await writeSupportImageDraft('draft-user', key, null);
    expect(await readSupportImageDraft(key, 'draft-user')).toBeNull();
  });
  it('clears only the signing-out account and invalidates pending preparations', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const image = { blob: new Blob(['pixels']), width: 100, height: 50, name: 'image.webp' };
    const a = supportImageDraftKey('draft-a', 'ticket'), b = supportImageDraftKey('draft-b', 'ticket');
    await writeSupportImageDraft('draft-a', a, image); await writeSupportImageDraft('draft-b', b, image);
    const epoch = supportImageDraftEpoch('draft-a'); await clearSupportImageDrafts('draft-a');
    expect(supportImageDraftEpoch('draft-a')).toBeGreaterThan(epoch);
    expect(await readSupportImageDraft(a, 'draft-a')).toBeNull(); expect(await readSupportImageDraft(b, 'draft-b')).toEqual(image);
    await clearSupportImageDrafts('draft-b');
  });
});

type StoredDraft = { key: string; userId: string; image: PreparedSupportImage; updatedAt: number; version?: number };
function draftDatabase(records: Map<string, StoredDraft>, holdReads = false) {
  const pending: Array<() => void> = [];
  let started!: () => void;
  const readStarted = new Promise<void>(resolve => { started = resolve; });
  const db = {
    transaction: () => {
      const transaction = {
        oncomplete: undefined as (() => void) | undefined,
        objectStore: () => ({
          get: (key: string) => {
            const request = { result: records.get(key), onsuccess: undefined as (() => void) | undefined };
            const finish = () => request.onsuccess?.();
            if (holdReads) pending.push(finish); else queueMicrotask(finish);
            started(); return request;
          },
          put: (record: StoredDraft) => records.set(record.key, record),
          delete: (key: string) => records.delete(key),
          openCursor: () => {
            const request = { result: null, onsuccess: undefined as (() => void) | undefined };
            queueMicrotask(() => { request.onsuccess?.(); transaction.oncomplete?.(); });
            return request;
          },
        }),
      };
      return transaction;
    },
  };
  vi.stubGlobal('indexedDB', { open: () => {
    const request = { result: db, onsuccess: undefined as (() => void) | undefined };
    queueMicrotask(() => request.onsuccess?.()); return request;
  } });
  return { readStarted, finishReads: () => pending.splice(0).forEach(finish => finish()) };
}

describe('versioned image draft recovery', () => {
  const original: PreparedSupportImage = { blob: new File(['original PNG bytes'], 'original.png', { type: 'image/png' }), width: 2400, height: 1200, name: 'image.png' };
  it('rejects and removes old canvas drafts, retains the notice during concurrent reads, and accepts a reattached original', async () => {
    vi.resetModules();
    const drafts = await import('./support-image-drafts');
    const key = 'legacy-user:tab:ticket';
    const records = new Map([[key, { key, userId: 'legacy-user', image: original, updatedAt: Date.now() }]]);
    draftDatabase(records);
    const results = await Promise.allSettled([drafts.readSupportImageDraft(key, 'legacy-user'), drafts.readSupportImageDraft(key, 'legacy-user')]);
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(result.reason.message).toContain('Attach the original image again');
    }
    expect(records.has(key)).toBe(false);
    expect(await drafts.writeSupportImageDraft('legacy-user', key, original)).toBe(true);
    expect(records.get(key)).toMatchObject({ version: 2 });
    expect(await drafts.readSupportImageDraft(key, 'legacy-user')).toBe(original);
  });
  it('restores new original-image records without touching another account’s legacy draft', async () => {
    vi.resetModules();
    const drafts = await import('./support-image-drafts');
    const key = 'current-user:tab:ticket', foreign = 'other-user:tab:ticket';
    const records = new Map<string, StoredDraft>([
      [key, { version: 2, key, userId: 'current-user', image: original, updatedAt: Date.now() }],
      [foreign, { key: foreign, userId: 'other-user', image: original, updatedAt: Date.now() }],
    ]);
    draftDatabase(records);
    expect(await drafts.readSupportImageDraft(key, 'current-user')).toBe(original);
    expect(await drafts.readSupportImageDraft(foreign, 'current-user')).toBeNull();
    expect(records.has(foreign)).toBe(true);
  });
  it('does not resurrect an image removed while the persisted draft was being read', async () => {
    vi.resetModules();
    const drafts = await import('./support-image-drafts');
    const key = 'race-user:tab:ticket';
    const records = new Map([[key, { version: 2, key, userId: 'race-user', image: original, updatedAt: Date.now() }]]);
    const database = draftDatabase(records, true);
    const pending = drafts.readSupportImageDraft(key, 'race-user');
    await database.readStarted;
    await drafts.writeSupportImageDraft('race-user', key, null);
    database.finishReads();
    expect(await pending).toBeNull();
    expect(records.has(key)).toBe(false);
  });
});
