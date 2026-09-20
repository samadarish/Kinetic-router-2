import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupportAudio, SupportAudioBlockedError } from './support-audio';
import { claimSupportAlert, SUPPORT_SOUND_URL } from './support-alerts';

class FakeSource {
  buffer?: AudioBuffer;
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn(() => this.onended?.());
  end() { this.onended?.(); }
}
class FakeContext extends EventTarget {
  static instances: FakeContext[] = [];
  static allowResume = true;
  state: AudioContextState = 'suspended';
  destination = {};
  sources: FakeSource[] = [];
  resume = vi.fn(() => {
    if (!FakeContext.allowResume) return new Promise<void>(() => {});
    this.state = 'running'; this.dispatchEvent(new Event('statechange')); return Promise.resolve();
  });
  close = vi.fn(() => { this.state = 'closed'; return Promise.resolve(); });
  decodeAudioData = vi.fn(async () => ({ duration: 1.5 } as AudioBuffer));
  createBufferSource = vi.fn(() => { const source = new FakeSource(); this.sources.push(source); return source; });
  constructor() { super(); FakeContext.instances.push(this); }
}

describe('support sound activation and playback', () => {
  const audio: SupportAudio[] = [];
  const create = (state = vi.fn()) => { const value = new SupportAudio(state); audio.push(value); return value; };
  beforeEach(() => {
    vi.useFakeTimers(); FakeContext.instances = []; FakeContext.allowResume = true;
    vi.stubGlobal('window', { AudioContext: FakeContext });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  });
  afterEach(() => { audio.splice(0).forEach(value => value.close()); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('resumes synchronously on activation and loads the supplied MP3 without playing it', async () => {
    const changed = vi.fn(), sound = create(changed);
    const activation = sound.activate();
    expect(FakeContext.instances[0]?.resume).toHaveBeenCalledOnce();
    await activation;
    await sound.prepare();
    expect(fetch).toHaveBeenCalledWith(SUPPORT_SOUND_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(FakeContext.instances).toHaveLength(1);
    expect(FakeContext.instances[0]?.createBufferSource).not.toHaveBeenCalled();
    expect(changed).toHaveBeenLastCalledWith({ ready: true, blocked: false });
  });

  it('allows a first incoming message without an explicit activation button when the browser permits it', async () => {
    const sound = create();
    await sound.prepare();
    const ended = sound.start(), context = FakeContext.instances[0]!;
    expect(context.sources[0]?.start).toHaveBeenCalledOnce();
    context.sources[0]?.end();
    await ended;
    expect(context.sources[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it('drops a blocked message promptly and does not replay it after a later gesture', async () => {
    FakeContext.allowResume = false;
    const changed = vi.fn(), sound = create(changed);
    const attempt = sound.prepare();
    const rejected = expect(attempt).rejects.toBeInstanceOf(SupportAudioBlockedError);
    await vi.advanceTimersByTimeAsync(600); await rejected;
    expect(changed).toHaveBeenLastCalledWith({ ready: false, blocked: true });
    FakeContext.allowResume = true;
    await sound.activate();
    expect(changed).toHaveBeenLastCalledWith({ ready: true, blocked: false });
    expect(FakeContext.instances[0]?.sources).toHaveLength(0);
  });

  it('lets a ready tab claim immediately while another tab is blocked outside the lock', async () => {
    const blocked = create(), ready = create();
    await ready.activate();
    FakeContext.allowResume = false;
    const blockedAttempt = blocked.prepare();
    const rejected = expect(blockedAttempt).rejects.toBeInstanceOf(SupportAudioBlockedError);
    let recorded = '';
    const saved = { getItem: () => recorded || null, setItem: (_key: string, value: string) => { recorded = value; } };
    const request = vi.fn(async (_key: string, run: () => Promise<boolean>) => run());
    const locks = { request } as unknown as Pick<LockManager, 'request'>;
    await ready.prepare();
    let finished: Promise<void> | undefined;
    await claimSupportAlert('user', 'message:sound', async () => { finished = ready.start(); }, saved, locks);
    expect(request).toHaveBeenCalledOnce();
    expect(recorded).toContain('message:sound');
    expect(FakeContext.instances[0]?.sources[0]?.start).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(600); await rejected;
    FakeContext.instances[0]?.sources[0]?.end(); await finished;
  });

  it('waits for completion and immediately stops the current sound when muted', async () => {
    const sound = create(); await sound.prepare();
    const first = sound.start(), idle = vi.fn();
    void sound.whenIdle().then(idle); await Promise.resolve();
    expect(idle).not.toHaveBeenCalled();
    sound.cancel(); await first; await Promise.resolve();
    expect(FakeContext.instances[0]?.sources[0]?.stop).toHaveBeenCalledOnce();
    expect(idle).toHaveBeenCalledOnce();
    const second = sound.start(); FakeContext.instances[0]?.sources[1]?.end(); await second;
  });

  it('stops audio on suspension so returning to the page cannot replay a stale source', async () => {
    const sound = create(); await sound.prepare();
    const playing = sound.start(), context = FakeContext.instances[0]!;
    context.state = 'suspended'; context.dispatchEvent(new Event('statechange')); await playing;
    expect(context.sources[0]?.stop).toHaveBeenCalledOnce();
    await sound.activate(); expect(context.sources).toHaveLength(1);
  });

  it('closes the account audio context and prevents pending preparation from playing after logout', async () => {
    const sound = create(); await sound.prepare();
    const playing = sound.start(); sound.close(); await playing;
    expect(FakeContext.instances[0]?.close).toHaveBeenCalledOnce();
    expect(() => sound.start()).toThrow(SupportAudioBlockedError);
    await expect(sound.activate()).rejects.toThrow('closed');
  });
});
