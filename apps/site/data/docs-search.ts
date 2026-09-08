export type DocsSearchEntry = { route: string; title: string; headings: string[]; text: string };
export type DocsSearchResult = DocsSearchEntry & { snippet: string };

export function decodeDocsSearchIndex(value: unknown): DocsSearchEntry[] {
  if (!Array.isArray(value)) throw new Error('Invalid documentation search index');
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid documentation search entry');
    const { route, title, headings, text } = entry as Record<string, unknown>;
    if (typeof route !== 'string' || !/^\/docs(?:\/[a-z0-9-]+)*$/.test(route)
      || typeof title !== 'string' || typeof text !== 'string'
      || !Array.isArray(headings) || !headings.every((heading: unknown) => typeof heading === 'string')) {
      throw new Error('Invalid documentation search entry');
    }
    return { route, title, headings: headings as string[], text };
  });
}

export function searchResultFocusIndex(direction: 'ArrowDown' | 'ArrowUp', current: number, count: number) {
  if (count === 0) return -1;
  if (current < 0) return direction === 'ArrowDown' ? 0 : count - 1;
  return (current + (direction === 'ArrowDown' ? 1 : -1) + count) % count;
}

export function searchDocumentation(entries: DocsSearchEntry[], query: string): DocsSearchResult[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (!terms.length) return [];
  return entries.map((entry) => {
    const title = entry.title.toLowerCase();
    const headings = entry.headings.join(' ').toLowerCase();
    const body = entry.text.toLowerCase();
    const searchable = `${title} ${headings} ${body}`;
    if (!terms.every((term) => searchable.includes(term))) return undefined;
    const score = terms.reduce((sum, term) => sum + (title.includes(term) ? 10 : headings.includes(term) ? 4 : 1), 0);
    const start = Math.max(0, body.indexOf(terms[0]) - 50);
    return { ...entry, score, snippet: `${start ? '…' : ''}${entry.text.slice(start, start + 170).replace(/\s+/g, ' ')}${entry.text.length > start + 170 ? '…' : ''}` };
  }).filter((entry): entry is DocsSearchResult & { score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 20)
    .map(({ route, title, headings, text, snippet }) => ({ route, title, headings, text, snippet }));
}
