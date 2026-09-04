import {
  createApiKeySchema,
  updateApiKeySchema,
} from '@kineticrouter/portal-contract';
import { Sub2ApiError } from '@kineticrouter/sub2api-client';

type CreateApiKeyInput = ReturnType<typeof createApiKeySchema.parse>;
type UpdateApiKeyInput = ReturnType<typeof updateApiKeySchema.parse>;

type Sub2ApiCreateKeyBody = {
  name: string;
  group_id?: number;
  custom_key?: string;
  ip_whitelist?: string[];
  ip_blacklist?: string[];
  quota?: number;
  expires_in_days?: number;
  rate_limit_5h?: number;
  rate_limit_1d?: number;
  rate_limit_7d?: number;
};

type Sub2ApiUpdateKeyBody = {
  name?: string;
  group_id?: number;
  ip_whitelist?: string[];
  ip_blacklist?: string[];
  quota?: number | null;
  expires_at?: string;
  rate_limit_5h?: number | null;
  rate_limit_1d?: number | null;
  rate_limit_7d?: number | null;
  status?: 'active' | 'inactive';
  reset_quota?: boolean;
  reset_rate_limit_usage?: boolean;
};

export function toCreateKeyBody(input: CreateApiKeyInput): Sub2ApiCreateKeyBody {
  return {
    name: input.name,
    ...(input.groupId ? { group_id: toUpstreamGroupId(input.groupId) } : {}),
    ...(input.customKey ? { custom_key: input.customKey } : {}),
    ...(input.ipWhitelist?.length ? { ip_whitelist: input.ipWhitelist } : {}),
    ...(input.ipBlacklist?.length ? { ip_blacklist: input.ipBlacklist } : {}),
    ...(isPositive(input.quota) ? { quota: input.quota } : {}),
    ...(isPositive(input.expiresInDays) ? { expires_in_days: input.expiresInDays } : {}),
    ...(isPositive(input.rateLimit5h) ? { rate_limit_5h: input.rateLimit5h } : {}),
    ...(isPositive(input.rateLimit1d) ? { rate_limit_1d: input.rateLimit1d } : {}),
    ...(isPositive(input.rateLimit7d) ? { rate_limit_7d: input.rateLimit7d } : {}),
  };
}

export function toUpdateKeyBody(input: UpdateApiKeyInput): Sub2ApiUpdateKeyBody {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.groupId !== undefined && input.groupId !== null
      ? { group_id: toUpstreamGroupId(input.groupId) }
      : {}),
    ...(input.ipWhitelist !== undefined ? { ip_whitelist: input.ipWhitelist } : {}),
    ...(input.ipBlacklist !== undefined ? { ip_blacklist: input.ipBlacklist } : {}),
    ...(input.quota !== undefined ? { quota: input.quota } : {}),
    ...(input.expiresAt !== undefined ? { expires_at: input.expiresAt ?? '' } : {}),
    ...(input.rateLimit5h !== undefined ? { rate_limit_5h: input.rateLimit5h } : {}),
    ...(input.rateLimit1d !== undefined ? { rate_limit_1d: input.rateLimit1d } : {}),
    ...(input.rateLimit7d !== undefined ? { rate_limit_7d: input.rateLimit7d } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.resetQuota !== undefined ? { reset_quota: input.resetQuota } : {}),
    ...(input.resetRateLimitUsage !== undefined ? { reset_rate_limit_usage: input.resetRateLimitUsage } : {}),
  };
}

function toUpstreamGroupId(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw invalidGroupIdError();
  }
  const groupId = Number(value);
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw invalidGroupIdError();
  }
  return groupId;
}

function invalidGroupIdError() {
  return new Sub2ApiError({
    status: 400,
    code: 'INVALID_GROUP_ID',
    message: 'Choose a valid API key group.',
  });
}

function isPositive(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && value > 0;
}
