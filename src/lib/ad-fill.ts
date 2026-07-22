/** Minimum rendered size to count iframe/img/video as a real creative. */
const MIN_CREATIVE_PX = 20;

function isBlankIframe(src: string): boolean {
  const s = src.trim().toLowerCase();
  return !s || s === "about:blank";
}

/** True when the slot contains a visible creative (iframe, image, video, or sized link). */
export function hasVisibleAdCreative(el: HTMLElement): boolean {
  for (const iframe of el.querySelectorAll("iframe")) {
    const rect = iframe.getBoundingClientRect();
    const src = iframe.src || iframe.getAttribute("src") || "";
    if (rect.width >= MIN_CREATIVE_PX && rect.height >= MIN_CREATIVE_PX && !isBlankIframe(src)) {
      return true;
    }
  }

  for (const img of el.querySelectorAll("img")) {
    if (img.offsetWidth >= MIN_CREATIVE_PX && img.offsetHeight >= MIN_CREATIVE_PX) return true;
  }

  for (const sel of ["video", "object", "embed"] as const) {
    for (const node of el.querySelectorAll(sel)) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= MIN_CREATIVE_PX && rect.height >= MIN_CREATIVE_PX) return true;
    }
  }

  // Juicy sometimes renders native ads as large clickable anchors.
  for (const a of el.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") || "";
    if (!href || href === "#") continue;
    const rect = a.getBoundingClientRect();
    if (rect.width >= 40 && rect.height >= MIN_CREATIVE_PX) return true;
  }

  return false;
}

/** Detect whether an ad network element failed to render a creative. */
export function isAdElementEmpty(el: HTMLElement | null, _minHeight = 20): boolean {
  if (!el) return true;
  if (hasVisibleAdCreative(el)) return false;

  const text = (el.textContent || "").toLowerCase();
  if (text.includes("new ad slot") || text.includes("advertisement space")) return true;

  // Reserved slot height (e.g. 300×250) with no iframe/img is still empty.
  return true;
}

function waitForElement(getEl: () => HTMLElement | null, maxMs = 2500): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const el = getEl();
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - start >= maxMs) {
        resolve(getEl());
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/** Poll until filled or timeout; returns true when empty after the wait. */
export function watchAdFill(
  el: HTMLElement | null | (() => HTMLElement | null),
  {
    timeoutMs = 6000,
    minHeight = 20,
    intervalMs = 400,
    waitForMountMs = 2500,
  }: {
    timeoutMs?: number;
    minHeight?: number;
    intervalMs?: number;
    waitForMountMs?: number;
  } = {}
): Promise<boolean> {
  const getEl = typeof el === "function" ? el : () => el;

  return waitForElement(getEl, waitForMountMs).then((mounted) => {
    if (!mounted) return true;

    return new Promise<boolean>((resolve) => {
      const start = Date.now();
      const tick = () => {
        const current = getEl();
        if (!current) {
          resolve(true);
          return;
        }
        if (!isAdElementEmpty(current, minHeight)) {
          resolve(false);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(true);
          return;
        }
        window.setTimeout(tick, intervalMs);
      };
      // Brief pause so ad scripts can inject after push/serve.
      window.setTimeout(tick, 200);
    });
  });
}
