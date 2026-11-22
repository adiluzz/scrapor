"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AGE_VERIFIED_EVENT,
  COOKIE_CONSENT_COOKIE,
  getCookieConsentChoice,
  hasAgeVerifiedCookie,
  hasAnalyticsConsent,
  setCookieConsentChoice,
  updateGoogleConsent,
} from "@/lib/consent";

type Props = {
  siteName: string;
  /**
   * Server already knows this visitor is 18+ and has not accepted analytics,
   * so the gate is in the first paint and the site is not visible underneath.
   */
  initiallyBlocked?: boolean;
  /** When true, force the dialog open (footer "Cookie settings"). */
  forceOpen?: boolean;
  onClose?: () => void;
};

/**
 * Blocks the site until the visitor accepts analytics. Shown only after the
 * age gate, so the choice is never collected before an 18+ confirmation.
 * Declining leaves the site.
 */
export default function CookieConsent({
  siteName,
  initiallyBlocked = false,
  forceOpen = false,
  onClose,
}: Props) {
  const [visible, setVisible] = useState(initiallyBlocked || forceOpen);

  const refresh = useCallback(() => {
    if (!hasAgeVerifiedCookie()) {
      setVisible(false);
      return;
    }
    if (forceOpen) {
      setVisible(true);
      return;
    }
    setVisible(!hasAnalyticsConsent());
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

  function accept() {
    setCookieConsentChoice("analytics");
    updateGoogleConsent(true);
    setVisible(false);
    onClose?.();
  }

  function decline() {
    document.cookie = `${COOKIE_CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    updateGoogleConsent(false);
    window.location.href = "https://www.google.com";
  }

  if (!visible) return null;

  const alreadyAccepted = getCookieConsentChoice() === "analytics";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Analytics consent"
      className="fixed inset-0 z-[99999] flex items-center justify-center overflow-y-auto bg-black p-4"
    >
      <div className="my-auto w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-center shadow-2xl sm:p-8 max-h-[min(90dvh,40rem)] overflow-y-auto">
        <h2 className="text-xl font-bold text-white sm:text-2xl">Analytics cookies</h2>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          {siteName} uses analytics cookies (Google Analytics) to understand how the site is used.
          Accepting analytics is required to view the site. If you decline, you will leave.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          See our{" "}
          <Link href="/privacy" className="text-brand-400 underline hover:text-brand-300">
            Privacy Policy
          </Link>{" "}
          for what is collected and your rights.
        </p>
        {forceOpen && alreadyAccepted && (
          <p className="mt-3 text-xs text-zinc-500">Current choice: Analytics accepted</p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={accept}
            className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white transition hover:bg-brand-500"
          >
            Accept analytics
          </button>
          <button
            type="button"
            onClick={decline}
            className="rounded-full bg-zinc-800 px-6 py-3 font-medium text-zinc-300 transition hover:bg-zinc-700"
          >
            Decline and leave
          </button>
        </div>
      </div>
    </div>
  );
}
