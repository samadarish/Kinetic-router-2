import type { ApiFailure, ApiSuccess } from '@kineticrouter/portal-contract';

let csrfToken = '';

export class PortalApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(input: { status: number; code: string; message: string; requestId?: string }) {
    super(input.message);
    this.name = 'PortalApiError';
    this.status = input.status;
    this.code = input.code;
    this.requestId = input.requestId;
  }
}

export function setCsrfToken(value?: string) {
  csrfToken = value ?? '';
}

export function getCsrfToken() {
  return csrfToken;
}

export async function portalApi<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken);

  let response: Response;
  try {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    response = await fetch(`/portal/v1${path}`, {
      ...init,
      method,
      headers,
      credentials: 'include',
      signal: init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    throw new PortalApiError({
      status: timedOut ? 504 : 0,
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: timedOut ? 'The request took too long.' : 'Unable to reach the kineticRouter console.',
    });
  }

  const payload = await response.json().catch(() => null) as ApiSuccess<T> | ApiFailure | null;
  if (!response.ok || !payload || payload.ok === false) {
    const failure = payload && payload.ok === false ? payload : undefined;
    const error = new PortalApiError({
      status: response.status,
      code: failure?.error.code ?? `HTTP_${response.status}`,
      message: failure?.error.message ?? 'The request could not be completed.',
      requestId: failure?.requestId,
    });
    if (response.status === 401) window.dispatchEvent(new CustomEvent('portal:unauthorized'));
    throw error;
  }
  return payload.data;
}

export function jsonBody(value: unknown): RequestInit {
  return { body: JSON.stringify(value) };
}

export function queryString(values: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
