export type KeyQuota =
  | { kind: 'unknown'; used?: number }
  | { kind: 'unlimited'; used?: number }
  | { kind: 'limited'; limit: number; used?: number; percent?: number };

function nonNegativeAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

export function keyQuota(quota: string | null | undefined, quotaUsed: string | null | undefined): KeyQuota {
  const used = nonNegativeAmount(quotaUsed);
  // The current Sub2API mapper uses null for an explicit unlimited quota.
  if (quota === null) return { kind: 'unlimited', used };
  const limit = nonNegativeAmount(quota);
  if (limit === undefined) return { kind: 'unknown', used };
  if (limit === 0) return { kind: 'unlimited', used };
  return { kind: 'limited', limit, used, percent: used === undefined ? undefined : Math.min(100, (used / limit) * 100) };
}

export function pageAfterKeyDeletion(page: number, currentItemCount: number) {
  return currentItemCount <= 1 ? Math.max(1, page - 1) : page;
}
