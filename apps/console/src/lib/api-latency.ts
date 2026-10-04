import { integrationRoutes, type IntegrationRouteId } from './quick-integration';

export async function measureApiLatency(routeId: IntegrationRouteId, signal: AbortSignal): Promise<number> {
  const deadline = new AbortController();
  const timeout = setTimeout(() => deadline.abort(new DOMException('Ping timed out', 'TimeoutError')), 5000);
  const requestSignal = AbortSignal.any([signal, deadline.signal]);
  const measurements: number[] = [];
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      requestSignal.throwIfAborted();
      // Measure the public host without touching authenticated model endpoints.
      const url = new URL('/', integrationRoutes[routeId].origin);
      url.searchParams.set('_ping', crypto.randomUUID());
      const start = performance.now();
      await fetch(url.toString(), {
        method: 'HEAD',
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'follow',
        signal: requestSignal,
      });
      requestSignal.throwIfAborted();
      // An opaque response still measures a completed HTTP connection, not API health.
      if (attempt > 0) measurements.push(performance.now() - start);
    }
    measurements.sort((a, b) => a - b);
    return Math.round(measurements[1]!);
  } finally {
    clearTimeout(timeout);
  }
}
