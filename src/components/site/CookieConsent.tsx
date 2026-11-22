"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AGE_VERIFIED_COOKIE,
  AGE_VERIFIED_EVENT,
  COOKIE_CONSENT_COOKIE,
  getCookieConsentChoice,
  hasAgeVerifiedCookie,
  hasAnalyticsConsent,
  setCookieConsentChoice,
  updateGoogleConsent,
  writeCookie,
} from "@/lib/consent";

type Props = {
  siteName: string;
  /**
   * Server already knows this visitor has not confirmed 18+ and analytics,
   * so the gate is in the first paint and the site is not visible underneath.
   */
  initiallyBlocked?: boolean;
  /** When true, force the dialog open (footer "Cookie settings"). */
  forceOpen?: boolean;
  onClose?: () => void;
};

/**
 * Single entry dialog. One button confirms the visitor is 18+ and accepts
 * analytics. Leaving sends them away without showing the site.
 */
export default function CookieConsent({
  siteName,
  initiallyBlocked = false,
  forceOpen = false,
  onClose,
}: Props) {
  const [visible, setVisible] = useState(initiallyBlocked || forceOpen);

  const refresh = useCallback(() => {
    if (forceOpen) {
      setVisible(true);
      return;
    }
    setVisible(!(hasAgeVerifiedCookie() && hasAnalyticsConsent()));
  }, [forceOpen]);

  useEffect(() => {
    refresh();
    window.addEventListener(AGE_VERIFIED_EVENT, refresh);
    return () => window.removeEventListener(AGE_VERIFIED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!visible) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [visible]);

  function enter() {
    writeCookie(AGE_VERIFIED_COOKIE, "1");
    setCookieConsentChoice("analytics");
    window.dispatchEvent(new CustomEvent(AGE_VERIFIED_EVENT));
    updateGoogleConsent(true);
    setVisible(false);
    onClose?.();
  }

  function leave() {
    document.cookie = `${COOKIE_CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    updateGoogleConsent(false);
    window.location.href = "https://www.google.com";
  }

  if (!visible) return null;

  const alreadyAccepted = hasAgeVerifiedCookie() && getCookieConsentChoice() === "analytics";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Age verification"
      className="age-gate fixed inset-0 z-[100000] flex items-center justify-center overflow-y-auto bg-black p-4"
    >
      <div className="my-auto w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center shadow-2xl sm:p-8 max-h-[min(90dvh,40rem)] overflow-y-auto">
        <h2 className="text-xl font-bold text-white sm:text-2xl">Age verification</h2>
        <p className="mt-2 text-sm text-zinc-500">You are about to enter {siteName}.</p>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          This website contains age-restricted material including nudity and explicit depictions of
          sexual activity. By entering you affirm that you are at least{" "}
          <strong className="text-zinc-200">18 years of age</strong> (or the age of majority in your
          jurisdiction) and that you consent to viewing sexually explicit content.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Entering also accepts analytics cookies (Google Analytics), which are required to view the
          site. See our{" "}
          <Link href="/privacy" className="text-brand-400 underline hover:text-brand-300">
            Privacy Policy
          </Link>
          .
        </p>
        {forceOpen && alreadyAccepted && (
          <p className="mt-3 text-xs text-zinc-500">Current choice: Analytics accepted</p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={enter}
            className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white transition hover:bg-brand-500"
          >
            I am 18 or older — Enter
          </button>
          <button
            type="button"
            onClick={leave}
            className="rounded-full bg-zinc-800 px-6 py-3 font-medium text-zinc-300 transition hover:bg-zinc-700"
          >
            Leave
          </button>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-zinc-600">
          Our{" "}
          <a href="/terms" className="underline hover:text-zinc-400">
            Terms
          </a>
          ,{" "}
          <a href="/privacy" className="underline hover:text-zinc-400">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/2257" className="underline hover:text-zinc-400">
            2257 Statement
          </a>{" "}
          apply. This site is labeled with the RTA (Restricted To Adults) tag.
        </p>
      </div>
    </div>
  );
}
