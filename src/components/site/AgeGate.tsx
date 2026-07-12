"use client";

import { useEffect, useState } from "react";
import { AGE_VERIFIED_COOKIE, AGE_VERIFIED_EVENT } from "@/lib/consent";

const COOKIE = AGE_VERIFIED_COOKIE;

/**
 * 18+ age verification gate. Rendered by the public site layout only when the
 * `age_verified` cookie is absent (so verified visitors never see a flash).
 * "Enter" stores consent for a year; "Leave" sends the visitor away.
 */
export default function AgeGate({ siteName = "this site" }: { siteName?: string }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function enter() {
    document.cookie = `${COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(AGE_VERIFIED_EVENT));
    setOpen(false);
  }

  function leave() {
    window.location.href = "https://www.google.com";
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Age verification"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/95 p-4 backdrop-blur"
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
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={enter}
            className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white transition hover:bg-brand-500"
          >
            I am 18 or older — Enter
          </button>
          <button
            onClick={leave}
            className="rounded-full bg-zinc-800 px-6 py-3 font-medium text-zinc-300 transition hover:bg-zinc-700"
          >
            I am under 18 — Leave
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
