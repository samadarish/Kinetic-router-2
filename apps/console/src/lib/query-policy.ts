import { PortalApiError } from './api';

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 1) return false;
  if (error instanceof Error && error.name === 'AbortError') return false;
  if (error instanceof PortalApiError) return error.status === 0 || error.status >= 500;
  return error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError');
}
