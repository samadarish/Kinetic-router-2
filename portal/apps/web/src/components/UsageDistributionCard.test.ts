import { describe, expect, it } from 'vitest';
import { createDistributionColorMap } from './UsageDistributionCard';

describe('usage distribution colors', () => {
  it('assigns a distinct color to each category until the palette is exhausted', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({ id: `category:${index}` }));
    const colorMap = createDistributionColorMap(items);

    expect(colorMap.size).toBe(items.length);
    expect(new Set(colorMap.values()).size).toBe(items.length);
  });

  it('keeps assignments stable when the input order changes', () => {
    const items = [
      { id: 'model:gpt-5.6-sol' },
      { id: 'model:gpt-5.6-luna' },
      { id: 'model:gpt-5.4-mini' },
    ];

    const firstMap = createDistributionColorMap(items);
    const reorderedMap = createDistributionColorMap([...items].reverse());

    expect([...reorderedMap]).toEqual([...firstMap]);
    expect(new Set(firstMap.values()).size).toBe(items.length);
  });
});
