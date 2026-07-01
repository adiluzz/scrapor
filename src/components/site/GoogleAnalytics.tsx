"use client";

import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import {
  AGE_VERIFIED_EVENT,
  canLoadAnalytics,
  COOKIE_CONSENT_EVENT,
  updateGoogleConsent,
} from "@/lib/consent";

type Props = {
  measurementId: string;
};

/**
 * Loads GA4 only after the visitor has passed the age gate AND accepted
 * analytics cookies. Consent Mode v2 defaults are set to denied earlier via
 * ConsentModeDefault in the site layout.
 */
export default function GoogleAnalytics({ measurementId }: Props) {
  const [enabled, setEnabled] = useState(false);

  const sync = useCallback(() => {
    const allowed = canLoadAnalytics();
    setEnabled(allowed);
    if (allowed) updateGoogleConsent(true);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(AGE_VERIFIED_EVENT, sync);
    window.addEventListener(COOKIE_CONSENT_EVENT, sync);
    return () => {
      window.removeEventListener(AGE_VERIFIED_EVENT, sync);
      window.removeEventListener(COOKIE_CONSENT_EVENT, sync);
    };
  }, [sync]);

  if (!enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('consent', 'update', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'granted'
          });
          gtag('config', '${measurementId}', {
            anonymize_ip: true,
            allow_google_signals: false,
            allow_ad_personalization_signals: false
          });
        `}
      </Script>
    </>
  );
}
