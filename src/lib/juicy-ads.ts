const JADS_SRC = "https://poweredby.jads.co/js/jads.js";

/**
 * jads.js calls `replaceChild` on the host `<ins>` and listens for resize
 * messages on the page. Doing that in the React tree detaches the node React
 * still owns and crashes the tab a few seconds after load. Each zone therefore
 * runs inside its own document.
 *
 * No `allow-top-navigation`: an ad must not be able to replace this page.
 */
export const JUICY_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";

export function juicySlotSrcDoc(zoneId: string, width: number, height: number): string {
  const id = String(zoneId).replace(/\D/g, "");
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  if (!id) return "<!DOCTYPE html><html><body></body></html>";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}iframe{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;border:0!important}</style></head><body><ins id="${id}" data-width="${w}" data-height="${h}" style="display:block;width:${w}px;height:${h}px"></ins><script>window.adsbyjuicy=window.adsbyjuicy||[];window.adsbyjuicy.push({adzone:${Number(id)}});</script><script src="${JADS_SRC}"></script></body></html>`;
}

/** Body of a Juicy slot frame, or the element itself for any other network. */
export function juicyFillRoot(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  if (typeof HTMLIFrameElement !== "undefined" && el instanceof HTMLIFrameElement) {
    try {
      return el.contentDocument?.body ?? null;
    } catch {
      return null;
    }
  }
  return el;
}
