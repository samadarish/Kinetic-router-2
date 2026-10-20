import { describe, expect, it, vi } from 'vitest';
import type { PlaygroundChatInput, PlaygroundEvent } from '@kineticrouter/portal-contract';
import { PlaygroundClient, PlaygroundGatewayError } from '@kineticrouter/sub2api-client';

const input: PlaygroundChatInput = {
  apiKeyId: '7', model: 'fixture-model', messages: [
    { role: 'user', content: 'Earlier question' },
    { role: 'assistant', content: 'Earlier answer' },
    { role: 'user', content: 'Current question' },
  ],
};
const systemPrompt = 'Fixture identity instruction';
const unsupported = { error: { param: 'reasoning_effort', code: 'unsupported_parameter', message: 'PRIVATE_UPSTREAM_ERROR' } };
const frame = (data: unknown) => `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
const completion = () => new Response(
  frame({ choices: [{ index: 0, delta: { content: 'Hello', reasoning_content: 'PRIVATE_THOUGHT' }, finish_reason: 'stop' }], usage: { prompt_tokens: 17, completion_tokens: 23, total_tokens: 40 } }) + frame('[DONE]'),
  { headers: { 'content-type': 'text/event-stream' } },
);
async function collect(events: AsyncIterable<PlaygroundEvent>) {
  const result: PlaygroundEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}
function fixture() {
  const fetcher = vi.fn<typeof fetch>();
  const client = new PlaygroundClient('https://gateway.invalid/v1', fetcher);
  const signal = new AbortController().signal;
  const send = () => client.chat('sk-fixture', input, signal, { systemPrompt });
  return { fetcher, client, signal, send };
}

describe('Playground low reasoning policy', () => {
  it('always sends low privately, preserving the exact model, context and identity instruction', async () => {
    const fx = fixture(); fx.fetcher.mockResolvedValueOnce(completion());
    expect(await collect(await fx.send())).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'usage', usage: { inputTokens: 17, outputTokens: 23, totalTokens: 40 } },
      { type: 'done', finishReason: 'stop' },
    ]);
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fx.fetcher.mock.calls[0]!;
    expect(url).toBe('https://gateway.invalid/v1/chat/completions');
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', signal: fx.signal });
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer sk-fixture');
    expect(JSON.parse(String(init!.body))).toEqual({
      model: input.model, messages: [{ role: 'system', content: systemPrompt }, ...input.messages],
      stream: true, stream_options: { include_usage: true }, max_completion_tokens: 8192, reasoning_effort: 'low',
    });
  });

  it.each([
    { status: 400, body: unsupported },
    { status: 422, body: unsupported },
    { status: 400, body: { error: { param: 'reasoning_effort', code: 'unsupported_value' } } },
    { status: 422, body: { error: { param: 'reasoning_effort', code: 'unknown_parameter' } } },
    { status: 400, body: { error: { message: "Unsupported parameter: 'reasoning_effort' is not supported with this model." } } },
    { status: 400, body: { error: { message: "Unsupported value: 'reasoning_effort' does not support 'low' with this model. Supported values are: 'medium'." } } },
    { status: 422, body: { error: { message: 'This model does not support the parameter reasoning_effort.' } } },
    { status: 400, body: { message: "Unsupported value: 'low' for parameter 'reasoning_effort'." } },
  ])('uses the default exactly once for an explicit $status rejection: $body', async ({ status, body }) => {
    const fx = fixture();
    fx.fetcher.mockResolvedValueOnce(Response.json(body, { status })).mockResolvedValueOnce(completion());
    expect(await collect(await fx.send())).toContainEqual({ type: 'done', finishReason: 'stop' });
    expect(fx.fetcher).toHaveBeenCalledTimes(2);
    const [firstUrl, first] = fx.fetcher.mock.calls[0]!;
    const [secondUrl, second] = fx.fetcher.mock.calls[1]!;
    const { reasoning_effort, ...defaultBody } = JSON.parse(String(first!.body));
    expect(reasoning_effort).toBe('low');
    expect(secondUrl).toBe(firstUrl);
    expect(second).toEqual({ ...first, body: JSON.stringify(defaultBody) });
    expect(second!.signal).toBe(fx.signal);
  });

  it.each([
    { error: { param: 'temperature', code: 'unsupported_parameter', message: 'Unsupported parameter: reasoning_effort' } },
    { error: { code: 'unsupported_parameter', message: 'Unsupported request.' } },
    { error: { param: 'reasoning_effort', code: 'invalid_request_error', message: 'Invalid request.' } },
    { error: { message: 'Unsupported model: fixture-model (reasoning_effort=low).' } },
    { error: { message: 'This model does not support streaming with reasoning_effort=low.' } },
    { error: { message: 'reasoning_effort requires additional access.' } },
    { error: { message: 'Request failed. A previous reasoning_effort setting was unsupported.' } },
    { error: 'reasoning_effort is not supported' },
    {},
  ])('does not retry ambiguous or unrelated validation errors: %j', async body => {
    const fx = fixture(); fx.fetcher.mockResolvedValueOnce(Response.json(body, { status: 400 }));
    await expect(fx.send()).rejects.toMatchObject({ failure: 'http', upstreamStatus: 400 });
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([307, 401, 402, 403, 404, 408, 409, 429, 500, 502, 503])('never retries HTTP %i even if its body mentions unsupported reasoning', async status => {
    const fx = fixture(); fx.fetcher.mockResolvedValueOnce(Response.json(unsupported, { status }));
    const pending = fx.send();
    await expect(pending).rejects.toMatchObject({ failure: 'http', upstreamStatus: status, message: expect.not.stringContaining('PRIVATE_') });
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([400, 422, 429, 503])('stops after the default attempt is rejected with %i and keeps errors private', async status => {
    const fx = fixture();
    fx.fetcher.mockResolvedValueOnce(Response.json(unsupported, { status: 400 }))
      .mockResolvedValueOnce(Response.json(unsupported, { status }));
    await expect(fx.send()).rejects.toMatchObject({ failure: 'http', upstreamStatus: status });
    expect(fx.fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retry a transport failure or expose its details', async () => {
    const fx = fixture(); fx.fetcher.mockRejectedValueOnce(new Error('PRIVATE_UPSTREAM_ERROR sk-secret'));
    await expect(fx.send()).rejects.toMatchObject({ failure: 'network', message: 'The model service could not be reached. Try again shortly.' });
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry again if the default attempt has a transport failure', async () => {
    const fx = fixture();
    fx.fetcher.mockResolvedValueOnce(Response.json(unsupported, { status: 400 }))
      .mockRejectedValueOnce(new Error('PRIVATE_UPSTREAM_ERROR'));
    await expect(fx.send()).rejects.toMatchObject({ failure: 'network' });
    expect(fx.fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(['', '<html>reasoning_effort is unsupported</html>', '{"error":', 'null', '[]'])('does not retry an unreadable rejection body: %j', async body => {
    const fx = fixture(); fx.fetcher.mockResolvedValueOnce(new Response(body, { status: 422 }));
    await expect(fx.send()).rejects.toBeInstanceOf(PlaygroundGatewayError);
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['declared size', 'streamed size', 'UTF-8 byte size'])('bounds rejection inspection to 8 KiB using %s', async kind => {
    const fx = fixture();
    const cancelled = vi.fn();
    const body = kind === 'UTF-8 byte size' ? JSON.stringify({ ...unsupported, note: 'é'.repeat(4100) }) : JSON.stringify(unsupported) + ' '.repeat(8192);
    const source = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); }, cancel: cancelled });
    fx.fetcher.mockResolvedValueOnce(new Response(source, { status: 400, headers: kind === 'declared size' ? { 'content-length': '8193' } : {} }));
    await expect(fx.send()).rejects.toMatchObject({ failure: 'http', upstreamStatus: 400 });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(source.locked).toBe(false);
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
  });

  it('accepts a complete valid rejection at exactly 8 KiB, including chunk boundaries', async () => {
    const fx = fixture();
    const text = JSON.stringify(unsupported).padEnd(8192, ' ');
    const source = new ReadableStream<Uint8Array>({ start(controller) {
      const bytes = new TextEncoder().encode(text);
      for (let i = 0; i < bytes.length; i += 37) controller.enqueue(bytes.slice(i, i + 37));
      controller.close();
    } });
    fx.fetcher.mockResolvedValueOnce(new Response(source, { status: 422 })).mockResolvedValueOnce(completion());
    await collect(await fx.send());
    expect(fx.fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retry invalid UTF-8 or a body read failure', async () => {
    for (const source of [
      new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify(unsupported))); controller.enqueue(new Uint8Array([0xff])); controller.close(); } }),
      new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('PRIVATE_UPSTREAM_ERROR')); } }),
    ]) {
      const fx = fixture(); fx.fetcher.mockResolvedValueOnce(new Response(source, { status: 400 }));
      await expect(fx.send()).rejects.toMatchObject({ failure: 'http', upstreamStatus: 400 });
      expect(fx.fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('honors an already cancelled request without calling the gateway', async () => {
    const fx = fixture(); const controller = new AbortController(); const reason = new Error('Stopped');
    controller.abort(reason);
    await expect(fx.client.chat('sk-fixture', input, controller.signal)).rejects.toBe(reason);
    expect(fx.fetcher).not.toHaveBeenCalled();
  });

  it('cancels rejection inspection under the existing signal without retrying or waiting on broken cancellation', async () => {
    const fx = fixture(); const controller = new AbortController(); const reason = new Error('Deadline reached');
    const cancelled = vi.fn(() => new Promise<void>(() => {}));
    const source = new ReadableStream<Uint8Array>({ cancel: cancelled });
    fx.fetcher.mockResolvedValueOnce(new Response(source, { status: 400 }));
    const rejected = expect(fx.client.chat('sk-fixture', input, controller.signal)).rejects.toBe(reason);
    await vi.waitFor(() => expect(source.locked).toBe(true));
    controller.abort(reason);
    await rejected;
    expect(source.locked).toBe(false);
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not start the default attempt if cancellation arrives with the rejection', async () => {
    const fx = fixture(); const controller = new AbortController(); const reason = new Error('Stopped');
    fx.fetcher.mockImplementationOnce(async () => {
      queueMicrotask(() => controller.abort(reason));
      return Response.json(unsupported, { status: 400 });
    });
    await expect(fx.client.chat('sk-fixture', input, controller.signal)).rejects.toBe(reason);
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['error frame', 'truncated stream', 'non-stream response'])('does not retry after a successful HTTP response with an %s', async kind => {
    const fx = fixture();
    const response = kind === 'non-stream response' ? Response.json(unsupported)
      : new Response(kind === 'error frame' ? frame(unsupported) : frame({ choices: [{ index: 0, delta: { content: 'Partial' } }] }), { headers: { 'content-type': 'text/event-stream' } });
    fx.fetcher.mockResolvedValueOnce(response);
    await expect((async () => collect(await fx.send()))()).rejects.toBeInstanceOf(PlaygroundGatewayError);
    expect(fx.fetcher).toHaveBeenCalledTimes(1);
  });
});
