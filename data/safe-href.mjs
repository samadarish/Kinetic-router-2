const relativeBase = 'https://site-content.invalid';
const unsafeUrlCharacters = /[\\\u0000-\u001f\u007f]/;

export function normalizeSiteHref(value, fallback) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2_048) return fallback;
  const candidate = value.trim();
  if (unsafeUrlCharacters.test(candidate)) return fallback;
  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    try {
      const url = new URL(candidate, relativeBase);
      if (url.origin !== relativeBase) return fallback;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}
