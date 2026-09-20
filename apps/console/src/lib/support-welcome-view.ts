/** Record a view only after one uninterrupted, eligible dwell; failures retry quietly. */
export function startWelcomeViewTracking({ eligible, recordView }: { eligible(): boolean; recordView(): Promise<void> }) {
  let disposed = false, complete = false, pending = false;
  let retryAt = 0;
  let dwell: ReturnType<typeof setTimeout> | undefined;
  const cancelDwell = () => { if (dwell !== undefined) clearTimeout(dwell); dwell = undefined; };
  function check() {
    if (disposed || complete || !eligible()) { cancelDwell(); return; }
    if (pending || dwell !== undefined || Date.now() < retryAt) return;
    dwell = setTimeout(() => {
      dwell = undefined;
      if (disposed || complete || pending || !eligible()) return;
      pending = true;
      void recordView().then(() => { complete = true; clearInterval(interval); }).catch(() => {
        retryAt = Date.now() + 10_000;
      }).finally(() => { pending = false; });
    }, 350);
  }
  // Covers scrolling and transient overlays even where IntersectionObserver is unavailable.
  const interval = setInterval(check, 100);
  check();
  return { check, dispose() { disposed = true; cancelDwell(); clearInterval(interval); } };
}
