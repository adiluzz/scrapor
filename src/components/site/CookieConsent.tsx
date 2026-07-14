"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AGE_VERIFIED_EVENT,
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_EVENT,
  getCookieConsentChoice,
  hasAgeVerifiedCookie,
  setCookieConsentChoice,
  updateGoogleConsent,
  type CookieConsentChoice,
} from "@/lib/consent";

type Props = {
  siteName: string;
  /** When true, force the banner open (e.g. footer "Cookie settings" link). */
  forceOpen?: boolean;
  onClose?: () => void;
};

/**
 * GDPR-style cookie banner. Shown only after the age gate cookie is set so
 * consent choices are never collected from visitors who have not confirmed 18+.
 */
export default function CookieConsent({ siteName, forceOpen = false, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  const refresh = useCallback(() => {
    if (forceOpen) {
      setVisible(hasAgeVerifiedCookie());
      return;
    }
    setVisible(hasAgeVerifiedCookie() && getCookieConsentChoice() === null);
  }, [forceOpen]);

  useEffect(() => {
    refresh();
    window.addEventListener(AGE_VERIFIED_EVENT, refresh);
    window.addEventListener(COOKIE_CONSENT_EVENT, refresh);
    return () => {
      window.removeEventListener(AGE_VERIFIED_EVENT, refresh);
      window.removeEventListener(COOKIE_CONSENT_EVENT, refresh);
    };
  }, [refresh]);

  function choose(choice: CookieConsentChoice) {
    setCookieConsentChoice(choice);
    updateGoogleConsent(choice === "analytics");
    setVisible(false);
    onClose?.();
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[99999] border-t border-zinc-800 bg-zinc-900/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl backdrop-blur sm:px-6 sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pt-6"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl text-sm leading-relaxed text-zinc-300">
          <p className="font-semibold text-white">Cookies on {siteName}</p>
          <p className="mt-2">
            We use strictly necessary cookies to remember your age verification and account session.
            With your permission we also use Google Analytics to understand how the site is used.
            See our{" "}
            <Link href="/privacy" className="text-brand-400 underline hover:text-brand-300">
              Privacy Policy
            </Link>{" "}
            for details, including what data is collected and your rights.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => choose("essential")}
            className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Necessary only
          </button>
          <button
            type="button"
            onClick={() => choose("analytics")}
            className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            Accept analytics
          </button>
        </div>
      </div>
      {forceOpen && getCookieConsentChoice() && (
        <p className="mx-auto mt-3 max-w-7xl text-xs text-zinc-500">
          Current choice:{" "}
          <span className="text-zinc-400">{readChoiceLabel(getCookieConsentChoice()!)}</span>
          {" · "}
          <button
            type="button"
            className="underline hover:text-zinc-300"
            onClick={() => {
              document.cookie = `${COOKIE_CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
              window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: { choice: null } }));
              updateGoogleConsent(false);
              refresh();
            }}
          >
            Reset choice
          </button>
        </p>
      )}
    </div>
  );
}

function readChoiceLabel(choice: CookieConsentChoice): string {
  return choice === "analytics" ? "Analytics accepted" : "Necessary cookies only";
}
