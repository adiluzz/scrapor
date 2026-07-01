import Script from "next/script";
import { CONSENT_MODE_DEFAULT_SCRIPT } from "@/lib/consent";

/** Runs before any Google tag so Consent Mode v2 defaults are always denied. */
export default function ConsentModeDefault() {
  return (
    <Script id="consent-mode-default" strategy="beforeInteractive">
      {CONSENT_MODE_DEFAULT_SCRIPT}
    </Script>
  );
}
