"use client";

import { useState } from "react";
import {
  STUDIO_INQUIRY_INTENTS,
  STUDIO_INQUIRY_LABELS,
  type StudioInquiryIntent,
} from "@/lib/studio-copy";

const fieldClass =
  "mt-2 w-full border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-brand-400/60";

export default function StudioContactForm({
  contactEmail,
  initialIntent,
}: {
  contactEmail: string;
  initialIntent: StudioInquiryIntent;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [intent, setIntent] = useState<StudioInquiryIntent>(initialIntent);
  const [message, setMessage] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/studio/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, intent, message, company }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || `We couldn't send that. Email ${contactEmail} directly.`);
        return;
      }
      setSent(true);
    } catch {
      setError(`We couldn't send that. Email ${contactEmail} directly.`);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <p className="border border-white/10 bg-white/[0.03] p-6 text-sm leading-relaxed text-zinc-300">
        Message sent. We read {contactEmail} and will reply to {email}.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="relative border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <p className="studio-kicker text-zinc-500">Write to the studio</p>
      <h2 className="font-display mt-3 text-3xl text-white">Send a note</h2>
      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm text-zinc-400">
          Name
          <input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
            autoComplete="name"
          />
        </label>
        <label className="block text-sm text-zinc-400">
          Email
          <input
            required
            type="email"
            maxLength={200}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            autoComplete="email"
          />
        </label>
        <label className="block text-sm text-zinc-400 sm:col-span-2">
          I want to talk about
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value as StudioInquiryIntent)}
            className={fieldClass}
          >
            {STUDIO_INQUIRY_INTENTS.map((key) => (
              <option key={key} value={key} className="bg-zinc-950">
                {STUDIO_INQUIRY_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-zinc-400 sm:col-span-2">
          Message
          <textarea
            required
            minLength={10}
            maxLength={4000}
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>
      <div className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
        <label>
          Company
          <input
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
      </div>
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      <button type="submit" disabled={loading} className="studio-cta mt-6 px-6 py-3 text-[11px] disabled:opacity-60">
        {loading ? "Sending" : "Send message"}
      </button>
    </form>
  );
}
