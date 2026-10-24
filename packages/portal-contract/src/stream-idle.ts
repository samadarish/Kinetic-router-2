/** A request may run indefinitely while bytes arrive; cancellation still wins. */
export function createStreamIdleTimeout(parent: AbortSignal, milliseconds: number, reason: Error) {
  const controller = new AbortController();
  const signal = AbortSignal.any([parent, controller.signal]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const dispose = () => {
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    signal.removeEventListener('abort', dispose);
  };
  const touch = () => {
    if (disposed || signal.aborted) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(reason), milliseconds);
  };
  signal.addEventListener('abort', dispose, { once: true });
  touch();
  return { signal, touch, dispose };
}
