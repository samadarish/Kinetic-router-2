import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilePlaygroundSettingsStore, MemoryPlaygroundSettingsStore, PlaygroundSettingsError } from '../apps/bff/src/playground-settings';
import { playgroundModelIdentitySchema, playgroundSettingsSchema, playgroundSettingsUpdateSchema } from '@kineticrouter/portal-contract';

const directories: string[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });

describe('playground settings persistence', () => {
  it.each(['memory', 'file'])('persists the global switch without clearing models or identities in %s storage', async kind => {
    const directory = await mkdtemp(join(tmpdir(), 'kinetic-playground-switch-')); directories.push(directory);
    const path = join(directory, 'settings.json');
    const store = kind === 'memory' ? new MemoryPlaygroundSettingsStore() : new FilePlaygroundSettingsStore(path);
    const modelIdentities = [{ modelId: 'chat', name: 'Example' }];
    await store.save({ revision: 0, enabledModelIds: ['chat'], modelIdentities, playgroundEnabled: false });
    const legacyUpdate = playgroundSettingsUpdateSchema.parse({ revision: 1, enabledModelIds: ['chat'] });
    expect(legacyUpdate).not.toHaveProperty('playgroundEnabled');
    const saved = await store.save(legacyUpdate);
    expect(saved).toEqual({ revision: 2, enabledModelIds: ['chat'], modelIdentities, playgroundEnabled: false });
    if (kind === 'file') expect(await new FilePlaygroundSettingsStore(path).read()).toEqual(saved);
    await expect(store.save({ revision: 1, enabledModelIds: [], playgroundEnabled: true })).rejects.toMatchObject({ status: 409 });
    expect((await store.read()).playgroundEnabled).toBe(false);
    expect(await store.save({ revision: 2, enabledModelIds: ['chat'], playgroundEnabled: true })).toEqual({ ...saved, revision: 3, playgroundEnabled: true });
  });

  it.each([null, 'true', 'false', 0, 1])('rejects an invalid global switch: %s', playgroundEnabled => {
    expect(playgroundSettingsUpdateSchema.safeParse({ revision: 0, enabledModelIds: [], playgroundEnabled }).success).toBe(false);
  });

  it('starts empty and makes exactly one revisioned concurrent save succeed', async () => {
    const store = new MemoryPlaygroundSettingsStore();
    expect(await store.read()).toEqual({ playgroundEnabled: true, revision: 0, enabledModelIds: [], modelIdentities: [] });
    const results = await Promise.allSettled([store.save({ revision: 0, enabledModelIds: ['chat'] }), store.save({ revision: 0, enabledModelIds: ['review'] })]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    const read = await store.read(); read.enabledModelIds.push('mutated');
    expect((await store.read()).enabledModelIds).toEqual(['chat']);
    expect(await store.save({ revision: 1, enabledModelIds: [] })).toEqual({ playgroundEnabled: true, revision: 2, enabledModelIds: [], modelIdentities: [] });
  });
  it('persists across instances and serializes concurrent saves for the same development file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kinetic-playground-test-')); directories.push(directory);
    const path = join(directory, 'settings.json');
    const first = new FilePlaygroundSettingsStore(path), second = new FilePlaygroundSettingsStore(path);
    expect(await first.read()).toEqual({ playgroundEnabled: true, revision: 0, enabledModelIds: [], modelIdentities: [] });
    const results = await Promise.allSettled([first.save({ revision: 0, enabledModelIds: ['chat'] }), second.save({ revision: 0, enabledModelIds: ['review'] })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(await new FilePlaygroundSettingsStore(path).read()).toEqual({ playgroundEnabled: true, revision: 1, enabledModelIds: ['chat'], modelIdentities: [] });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ playgroundEnabled: true, revision: 1, enabledModelIds: ['chat'], modelIdentities: [] });
  });
  it('fails closed on corrupt storage and never overwrites it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kinetic-playground-test-')); directories.push(directory);
    const path = join(directory, 'settings.json'); await writeFile(path, '{bad json');
    const store = new FilePlaygroundSettingsStore(path);
    await expect(store.read()).rejects.toMatchObject({ status: 503 });
    await expect(store.save({ revision: 0, enabledModelIds: ['chat'] })).rejects.toBeInstanceOf(PlaygroundSettingsError);
    expect(await readFile(path, 'utf8')).toBe('{bad json');
  });
  it('rejects duplicates, invalid revisions, controls, extra properties, and excessive selections', () => {
    for (const input of [
      { revision: -1, enabledModelIds: [] }, { revision: 0.1, enabledModelIds: [] },
      { revision: 0, enabledModelIds: ['same', 'same'] }, { revision: 0, enabledModelIds: ['bad\u0000id'] },
      { revision: 0, enabledModelIds: [], injected: true },
      { revision: 0, enabledModelIds: Array.from({ length: 501 }, (_, index) => `model-${index}`) },
    ]) expect(playgroundSettingsSchema.safeParse(input).success).toBe(false);
    expect(playgroundSettingsSchema.parse({ revision: 0, enabledModelIds: ['Model', 'model', 'gpt-image-1', 'codex-auto-review'] }).enabledModelIds).toHaveLength(4);
  });
});

describe('model identity settings', () => {
  const identities = [{ modelId: 'chat', name: 'Example', knowledgeCutoff: '2025-06' }];

  it.each(['memory', 'file'])('keeps identities through legacy writes and disabled models in %s storage', async kind => {
    const directory = await mkdtemp(join(tmpdir(), 'kinetic-identity-test-')); directories.push(directory);
    const path = join(directory, 'settings.json');
    const store = kind === 'memory' ? new MemoryPlaygroundSettingsStore() : new FilePlaygroundSettingsStore(path);
    const saved = await store.save({ revision: 0, enabledModelIds: ['chat'], modelIdentities: identities });
    saved.modelIdentities[0]!.name = 'Mutated result';
    const read = await store.read(); read.modelIdentities[0]!.knowledgeCutoff = '1999-01';
    expect((await store.read()).modelIdentities).toEqual(identities);
    expect(await store.save(playgroundSettingsUpdateSchema.parse({ revision: 1, enabledModelIds: [] })))
      .toEqual({ playgroundEnabled: true, revision: 2, enabledModelIds: [], modelIdentities: identities });
    await expect(store.save({ revision: 1, enabledModelIds: ['stale'] })).rejects.toMatchObject({ status: 409 });
    expect((await store.read()).modelIdentities).toEqual(identities);
    await store.save({ revision: 2, enabledModelIds: ['chat'] });
    if (kind === 'file') expect((await new FilePlaygroundSettingsStore(path).read()).modelIdentities).toEqual(identities);
    expect(await store.save({ revision: 3, enabledModelIds: ['chat'], modelIdentities: [] }))
      .toEqual({ playgroundEnabled: true, revision: 4, enabledModelIds: ['chat'], modelIdentities: [] });
  });

  it('normalizes old records on read without a revision bump or file rewrite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kinetic-identity-test-')); directories.push(directory);
    const path = join(directory, 'settings.json');
    const legacy = '{ "revision": 12, "enabledModelIds": ["chat"] }\n';
    await writeFile(path, legacy);
    const store = new FilePlaygroundSettingsStore(path);
    expect(await store.read()).toEqual({ playgroundEnabled: true, revision: 12, enabledModelIds: ['chat'], modelIdentities: [] });
    expect(await readFile(path, 'utf8')).toBe(legacy);
    expect((await store.save({ revision: 12, enabledModelIds: ['chat'], modelIdentities: identities })).revision).toBe(13);
  });

  it('saves identity and enablement together with one winner for concurrent revisions', async () => {
    const store = new MemoryPlaygroundSettingsStore();
    const results = await Promise.allSettled([
      store.save({ revision: 0, enabledModelIds: ['chat'], modelIdentities: identities }),
      store.save({ revision: 0, enabledModelIds: ['other'], modelIdentities: [{ modelId: 'other', name: 'Other' }] }),
    ]);
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as PromiseRejectedResult).reason.status).toBe(409);
    expect(await store.read()).toEqual({ playgroundEnabled: true, revision: 1, enabledModelIds: ['chat'], modelIdentities: identities });
  });

  it('keeps omission distinct from explicit clearing and permits either identity field', () => {
    const base = { revision: 0, enabledModelIds: [] };
    expect(playgroundSettingsSchema.parse(base).modelIdentities).toEqual([]);
    expect(playgroundSettingsUpdateSchema.parse(base)).not.toHaveProperty('modelIdentities');
    expect(playgroundSettingsUpdateSchema.parse({ ...base, modelIdentities: [] }).modelIdentities).toEqual([]);
    expect(playgroundModelIdentitySchema.parse({ modelId: 'chat', name: ' Example ' })).toEqual({ modelId: 'chat', name: 'Example' });
    expect(playgroundModelIdentitySchema.parse({ modelId: 'chat', knowledgeCutoff: '2025-06' })).toEqual({ modelId: 'chat', knowledgeCutoff: '2025-06' });
  });

  it('rejects malformed identity fields, duplicate IDs, excessive rows and arbitrary prompts', () => {
    for (const name of ['', '   ', 'x'.repeat(81), 'line\nbreak', 'tab\tname', 'next\u0085line', 'line\u2028break', 'line\u2029break', '\u0000']) {
      expect(playgroundModelIdentitySchema.safeParse({ modelId: 'chat', name }).success, JSON.stringify(name)).toBe(false);
    }
    for (const knowledgeCutoff of ['', '2025', '2025-00', '2025-13', '0000-01', '2025-01-01', '25-01', '2025-1']) {
      expect(playgroundModelIdentitySchema.safeParse({ modelId: 'chat', knowledgeCutoff }).success, knowledgeCutoff).toBe(false);
    }
    for (const modelIdentities of [
      [{ modelId: 'chat' }], [...identities, ...identities],
      [{ ...identities[0], systemPrompt: 'Arbitrary prompt' }],
      Array.from({ length: 501 }, (_, index) => ({ modelId: `model-${index}`, name: 'Example' })),
    ]) expect(playgroundSettingsUpdateSchema.safeParse({ revision: 0, enabledModelIds: [], modelIdentities }).success).toBe(false);
  });
});
