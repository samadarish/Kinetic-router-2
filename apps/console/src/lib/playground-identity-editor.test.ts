import { describe, expect, it } from 'vitest';
import { identityDrafts, identityEntries, modelIdentitiesChanged, preparePlaygroundSettings } from './playground-identity-editor';

const saved = { playgroundEnabled: true, revision: 4, enabledModelIds: ['a'], modelIdentities: [{ modelId: 'a', name: 'Example' }, { modelId: 'disabled', knowledgeCutoff: '2025-06' }] };

describe('playground identity drafts', () => {
  it('detects metadata-only changes and clears identities independently of model enablement', () => {
    const drafts = identityDrafts(saved.modelIdentities);
    expect(modelIdentitiesChanged(saved.modelIdentities, drafts)).toBe(false);
    drafts.set('a', { name: 'New name', knowledgeCutoff: '' });
    expect(modelIdentitiesChanged(saved.modelIdentities, drafts)).toBe(true);
    expect(preparePlaygroundSettings(saved, new Set(saved.enabledModelIds), drafts)).toEqual({
      ...saved, modelIdentities: [{ modelId: 'a', name: 'New name' }, { modelId: 'disabled', knowledgeCutoff: '2025-06' }],
    });
    drafts.set('a', { name: '', knowledgeCutoff: '' });
    expect(identityEntries(drafts)).toEqual([{ modelId: 'disabled', knowledgeCutoff: '2025-06' }]);
    drafts.set('disabled', { name: '', knowledgeCutoff: '' });
    expect(preparePlaygroundSettings(saved, new Set(['a']), drafts).modelIdentities).toEqual([]);
    expect(saved.modelIdentities[0]!.name).toBe('Example');
  });

  it('normalizes whitespace and order without false dirty changes or unsafe model property names', () => {
    const drafts = identityDrafts([...saved.modelIdentities].reverse());
    drafts.set('a', { name: ' Example ', knowledgeCutoff: '' });
    drafts.set('blank', { name: ' ', knowledgeCutoff: '' });
    expect(modelIdentitiesChanged(saved.modelIdentities, drafts)).toBe(false);
    drafts.set('__proto__', { name: 'Prototype model', knowledgeCutoff: '' });
    drafts.set('constructor', { name: '', knowledgeCutoff: '2024-12' });
    expect(identityEntries(drafts)).toContainEqual({ modelId: '__proto__', name: 'Prototype model' });
    expect(identityEntries(drafts)).toContainEqual({ modelId: 'constructor', knowledgeCutoff: '2024-12' });
  });

  it('identifies the invalid model and leaves drafts intact for correction', () => {
    const drafts = identityDrafts(saved.modelIdentities);
    drafts.set('disabled', { name: '', knowledgeCutoff: '2025-13' });
    expect(() => preparePlaygroundSettings(saved, new Set(['a']), drafts)).toThrow('disabled: Use a valid month and year.');
    expect(drafts.get('disabled')?.knowledgeCutoff).toBe('2025-13');
    drafts.set('disabled', { name: '', knowledgeCutoff: '2025-12' });
    expect(() => preparePlaygroundSettings(saved, new Set(['a']), drafts)).not.toThrow();
  });

  it('checks the actual UTF-8 request size without truncating valid-sized entries', () => {
    const identities = Array.from({ length: 500 }, (_, index) => ({ modelId: `model-${index}`, name: 'a'.repeat(80) }));
    const drafts = identityDrafts(identities);
    expect(preparePlaygroundSettings(saved, new Set(), drafts).modelIdentities).toHaveLength(500);
    for (const [id, value] of drafts) drafts.set(id, { ...value, name: '\u754c'.repeat(80) });
    expect(() => preparePlaygroundSettings(saved, new Set(), drafts)).toThrow('exceed the save limit');
    expect(drafts.size).toBe(500);
    expect(drafts.get('model-0')?.name).toBe('\u754c'.repeat(80));
  });

  it('keeps partial native month input invalid even when its row is not mounted', () => {
    const drafts = identityDrafts(saved.modelIdentities);
    drafts.set('a', { name: 'Example', knowledgeCutoff: '', invalidCutoff: true });
    expect(modelIdentitiesChanged(saved.modelIdentities, drafts)).toBe(true);
    expect(() => preparePlaygroundSettings(saved, new Set(['a']), drafts)).toThrow('a: enter a complete month and year or use Clear identity.');
    drafts.set('a', { name: 'Example', knowledgeCutoff: '2025-06', invalidCutoff: false });
    expect(preparePlaygroundSettings(saved, new Set(['a']), drafts).modelIdentities).toContainEqual({ modelId: 'a', name: 'Example', knowledgeCutoff: '2025-06' });
    drafts.set('a', { name: '', knowledgeCutoff: '', invalidCutoff: false });
    expect(preparePlaygroundSettings(saved, new Set(['a']), drafts).modelIdentities).toEqual([{ modelId: 'disabled', knowledgeCutoff: '2025-06' }]);
  });
});
