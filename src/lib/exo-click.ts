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
  const push = () => {
    try {
      window.AdProvider = window.AdProvider || [];
      window.AdProvider.push({ serve: {} });
    } catch {
      /* ignore */
    }
  };
  push();
  // ad-provider.js is loaded afterInteractive — retry briefly so SPA mounts
  // that race the script still get served.
  if (typeof document !== "undefined") {
    const hasScript = Boolean(
      document.querySelector('script[src*="ad-provider.js"]')
    );
    if (hasScript) {
      window.setTimeout(push, 250);
      window.setTimeout(push, 1000);
    }
  }
}
