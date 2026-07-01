"use client";

import { useState } from "react";
import CookieConsent from "@/components/site/CookieConsent";

type Props = {
  siteName: string;
};

/** Footer trigger to reopen cookie preferences after the initial choice. */
export default function CookieSettings({ siteName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hover:text-zinc-300"
      >
        Cookie settings
      </button>
      {open && (
        <CookieConsent
          siteName={siteName}
          forceOpen
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
