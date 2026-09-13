import type { ApiFailure, PlaygroundTurnInput, PlaygroundEvent } from '@kineticrouter/portal-contract';
import { getCsrfToken, PortalApiError } from './api';
import { consumePlaygroundStream } from './playground-stream';

export async function streamPlayground(input: PlaygroundTurnInput, onEvent: (event: PlaygroundEvent) => void, signal: AbortSignal) {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(120_000)]);
  const response = await fetch('/portal/v1/playground/chat', {
    method: 'POST', credentials: 'include', signal: combined,
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiFailure | null;
    if (response.status === 401) window.dispatchEvent(new CustomEvent('portal:unauthorized'));
    throw new PortalApiError({ status: response.status, code: payload?.error?.code ?? 'PLAYGROUND_REQUEST_FAILED', message: payload?.error?.message ?? 'The model request could not be completed.', requestId: payload?.requestId });
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('The model response could not be read.');
  await consumePlaygroundStream(response.body, onEvent, combined);
}
