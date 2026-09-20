import { SUPPORT_SOUND_URL } from './support-alerts';

export class SupportAudioBlockedError extends Error {
  constructor() { super('Interact with this page to activate message sounds.'); this.name = 'SupportAudioBlockedError'; }
}

type SoundState = { ready: boolean; blocked: boolean };
type Playback = { finished: Promise<void>; stop(): void };

/** One quietly activated audio context per signed-in tab; activation never plays a sample. */
export class SupportAudio {
  private context?: AudioContext;
  private buffer?: AudioBuffer;
  private loading?: Promise<AudioBuffer>;
  private loadController?: AbortController;
  private current?: Playback;
  private blocked = false;
  private closed = false;

  constructor(private readonly onState: (state: SoundState) => void) {}

  private report() { this.onState({ ready: this.context?.state === 'running', blocked: this.blocked }); }
  private readonly stateChanged = () => {
    if (this.context?.state === 'running') this.blocked = false;
    else this.current?.stop();
    this.report();
  };
  private getContext() {
    if (this.closed) throw new Error('Message sounds are closed.');
    if (!this.context) {
      const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) throw new Error('Message sounds are unavailable in this browser.');
      this.context = new Constructor();
      this.context.addEventListener('statechange', this.stateChanged);
      this.report();
    }
    return this.context;
  }

  private async resume(reportBlocked: boolean) {
    const context = this.getContext();
    if (context.state !== 'running') {
      // Start resume synchronously in the click/keydown call stack. Autoplay-denied
      // resume promises can remain pending indefinitely, so never wait on one in a lock.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          context.resume(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SupportAudioBlockedError()), 600); }),
        ]);
      } catch {
        if (reportBlocked && !this.closed) { this.blocked = true; this.report(); }
        throw new SupportAudioBlockedError();
      } finally { clearTimeout(timer); }
    }
    if (this.closed || context.state !== 'running') throw new SupportAudioBlockedError();
    this.blocked = false; this.report();
  }

  private loadBuffer() {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (!this.loading) {
      const context = this.getContext(), controller = new AbortController();
      this.loadController = controller;
      const timer = setTimeout(() => controller.abort(), 5000);
      this.loading = fetch(SUPPORT_SOUND_URL, { signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error('The message sound could not be loaded.'); return response.arrayBuffer(); })
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => { if (this.closed) throw new Error('Message sounds are closed.'); this.buffer = buffer; return buffer; })
        .catch(cause => { this.loading = undefined; throw cause; })
        .finally(() => { clearTimeout(timer); });
    }
    return this.loading;
  }

  /** Call directly from a trusted gesture, before awaiting anything else. */
  async activate() {
    await this.resume(false);
    // Warm the small MP3 without attaching any source to the speakers.
    void this.loadBuffer().catch(() => {});
  }

  /** Preparation occurs outside the cross-tab lock so blocked tabs cannot hold it. */
  async prepare() { await this.resume(true); await this.loadBuffer(); }

  whenIdle() { return this.current?.finished ?? Promise.resolve(); }

  /** Starts immediately, returning completion separately so the claim lock stays short. */
  start(): Promise<void> {
    if (!this.buffer || this.context?.state !== 'running' || this.closed) {
      this.blocked = !this.closed; this.report(); throw new SupportAudioBlockedError();
    }
    this.current?.stop();
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.context.destination);
    let finish!: () => void;
    const finished = new Promise<void>(resolve => { finish = resolve; });
    let timer: ReturnType<typeof setTimeout> | undefined, ended = false;
    const cleanup = () => {
      if (ended) return;
      ended = true; clearTimeout(timer); source.onended = null; source.disconnect();
      if (this.current === playback) this.current = undefined;
      finish();
    };
    const playback: Playback = { finished, stop: () => { try { source.stop(); } catch { /* Already ended. */ } cleanup(); } };
    this.current = playback;
    source.onended = cleanup;
    // A suspended/frozen document must not retain an indefinitely pending queue.
    timer = setTimeout(playback.stop, Math.min(10000, this.buffer.duration * 1000 + 1000));
    try { source.start(); } catch (cause) { playback.stop(); throw cause; }
    return finished;
  }

  cancel() { this.current?.stop(); this.blocked = false; this.report(); }
  close() {
    if (this.closed) return;
    this.closed = true; this.current?.stop(); this.loadController?.abort();
    this.context?.removeEventListener('statechange', this.stateChanged);
    void this.context?.close().catch(() => {});
    this.context = undefined; this.buffer = undefined; this.loading = undefined; this.blocked = false;
    this.report();
  }
}
