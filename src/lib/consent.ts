/** Cookie set when the visitor passes the 18+ age gate. */
export const AGE_VERIFIED_COOKIE = "age_verified";

/** Stores the visitor's cookie consent choice (`essential` | `analytics`). */
export const COOKIE_CONSENT_COOKIE = "cookie_consent";

export type CookieConsentChoice = "essential" | "analytics";

export const COOKIE_CONSENT_EVENT = "cookie-consent-changed";
export const AGE_VERIFIED_EVENT = "age-verified";

const ONE_YEAR_SECONDS = 31_536_000;

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[$()*+.?[\\\]^{|}-]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeCookie(name: string, value: string, maxAgeSeconds = ONE_YEAR_SECONDS) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

export function hasAgeVerifiedCookie(): boolean {
  return readCookie(AGE_VERIFIED_COOKIE) === "1";
}

export function getCookieConsentChoice(): CookieConsentChoice | null {
  const value = readCookie(COOKIE_CONSENT_COOKIE);
  return value === "essential" || value === "analytics" ? value : null;
}

export function hasAnalyticsConsent(): boolean {
  return getCookieConsentChoice() === "analytics";
}

export function canLoadAnalytics(): boolean {
  return hasAgeVerifiedCookie() && hasAnalyticsConsent();
}

export function setCookieConsentChoice(choice: CookieConsentChoice) {
  writeCookie(COOKIE_CONSENT_COOKIE, choice);
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: { choice } }));
}

/** Google Consent Mode v2 default — all optional storage denied until explicit consent. */
export const CONSENT_MODE_DEFAULT_SCRIPT = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'granted',
  security_storage: 'granted',
  wait_for_update: 500
});
`;

export function updateGoogleConsent(granted: boolean) {
  if (typeof window.gtag !== "function") return;
  const state = granted ? "granted" : "denied";
  window.gtag("consent", "update", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: state,
  });
}
