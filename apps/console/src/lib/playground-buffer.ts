/** Throttle rendering only. The wire text and its order are never changed. */
export function createPlaygroundBuffer(emit: (text: string) => void, interval = 50) {
  let pending = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPaint = -Infinity;
  let disposed = false;
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (disposed || !pending) return;
    const text = pending;
    pending = '';
    lastPaint = performance.now();
    emit(text);
  };
  return {
    push(text: string) {
      if (disposed || !text) return;
      pending += text;
      const remaining = interval - (performance.now() - lastPaint);
      if (remaining <= 0) flush();
      else if (timer === undefined) timer = setTimeout(flush, remaining);
    },
    flush,
    dispose() { disposed = true; pending = ''; if (timer !== undefined) clearTimeout(timer); timer = undefined; },
  };
}
