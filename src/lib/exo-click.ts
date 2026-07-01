/** ExoClick publisher `<ins>` class (matches the site-verification meta hash). */
export const EXO_INS_CLASS = "eas6a97888e2";

declare global {
  interface Window {
    AdProvider?: Array<Record<string, unknown>>;
  }
}

/** Ask ad-provider.js to fill every unserved `<ins data-zoneid>` on the page. */
export function serveExoAds() {
  if (typeof window === "undefined") return;
  try {
    window.AdProvider = window.AdProvider || [];
    window.AdProvider.push({ serve: {} });
  } catch {
    /* ignore */
  }
}
