/** ExoClick publisher `<ins>` class for banners (hash + zone type 2). */
export const EXO_INS_CLASS = "eas6a97888e2";

/**
 * Exo encodes the ad format in the trailing digits of the `<ins>` class
 * (`eas` + shortHash + zoneType). ad-provider.js reads
 * `parseInt(className.substring(11))` as `zone_type`.
 *
 * Using the banner class (`…2`) for Fullpage / Popunder causes Exo to request
 * those zone IDs as banners; magsrv then returns `allowed_domains` errors and
 * never arms the click trigger.
 */
export const EXO_ZONE_TYPE = {
  BANNER: 2,
  POPUNDER: 3,
  MOBILE_FULLPAGE: 33,
  DESKTOP_FULLPAGE: 35,
} as const;

/** CDNs needed so FPI / popunder can be requested (magsrv alone lacks those types). */
export const EXO_AD_PROVIDER_SCRIPTS = [
  "https://a.magsrv.com/ad-provider.js",
  "https://a.orbsrv.com/ad-provider.js",
  "https://a.pemsrv.com/ad-provider.js",
] as const;

/**
 * Prefix is `eas` + 8-char shortHash (`eas6a97888e`). Admin may store the full
 * banner class (`eas6a97888e2`); strip the trailing type digits.
 */
export function exoInsPrefix(insClass?: string | null): string {
  const raw = (insClass || EXO_INS_CLASS).trim();
  const m = raw.match(/^(eas[0-9a-f]{8})/i);
  return m ? m[1] : "eas6a97888e";
}

export function exoInsClassFor(
  zoneType: number,
  insClass?: string | null
): string {
  return `${exoInsPrefix(insClass)}${zoneType}`;
}

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
