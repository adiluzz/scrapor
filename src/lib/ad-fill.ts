/** Detect whether an ad network element failed to render a creative. */
export function isAdElementEmpty(el: HTMLElement | null, minHeight = 20): boolean {
  if (!el) return true;
  if (el.childElementCount === 0 && el.offsetHeight < minHeight) return true;
  // Exo "new ad slot" placeholders keep minHeight but have no iframe/img child.
  const hasCreative = el.querySelector("iframe, img, a, video, object, embed");
  if (!hasCreative && el.offsetHeight < minHeight + 10) return true;
  return !hasCreative && el.textContent?.includes("new ad slot") === true;
}

/** Poll until filled or timeout; returns true when empty after the wait. */
export function watchAdFill(
  el: HTMLElement | null,
  {
    timeoutMs = 6000,
    minHeight = 20,
    intervalMs = 500,
  }: { timeoutMs?: number; minHeight?: number; intervalMs?: number } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!el) {
      resolve(true);
      return;
    }
    const start = Date.now();
    const tick = () => {
      if (!isAdElementEmpty(el, minHeight)) {
        resolve(false);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(true);
        return;
      }
      window.setTimeout(tick, intervalMs);
    };
    tick();
  });
}
