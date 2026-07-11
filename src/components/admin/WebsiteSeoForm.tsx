"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none";

type SeoFields = {
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string;
  ogImagePath: string | null;
  exoSiteVerification: string | null;
  homeH1: string | null;
  homeIntroHtml: string | null;
};

export default function WebsiteSeoForm({
  siteId,
  initial,
}: {
  siteId: string;
  initial: SeoFields;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    seoTitle: initial.seoTitle || "",
    seoDescription: initial.seoDescription || "",
    seoKeywords: initial.seoKeywords || "",
    ogImagePath: initial.ogImagePath || "",
    exoSiteVerification: initial.exoSiteVerification || "",
    homeH1: initial.homeH1 || "",
    homeIntroHtml: initial.homeIntroHtml || "",
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("");
    setLoading(true);
    try {
      const keywords = form.seoKeywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const res = await fetch(`/api/admin/sites/${siteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seoTitle: form.seoTitle || null,
          seoDescription: form.seoDescription || null,
          seoKeywords: keywords,
          ogImagePath: form.ogImagePath || null,
          exoSiteVerification: form.exoSiteVerification || null,
          homeH1: form.homeH1 || null,
          homeIntroHtml: form.homeIntroHtml || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      setStatus("Saved.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      {(error || status) && (
        <p
          className={`rounded px-3 py-2 text-sm ${
            error ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {error || status}
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">SEO title</span>
        <input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} className={inputClass} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">SEO description</span>
        <textarea
          rows={3}
          value={form.seoDescription}
          onChange={(e) => set("seoDescription", e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">SEO keywords (comma-separated)</span>
        <textarea
          rows={2}
          value={form.seoKeywords}
          onChange={(e) => set("seoKeywords", e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">OG image path</span>
        <input value={form.ogImagePath} onChange={(e) => set("ogImagePath", e.target.value)} className={inputClass} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Exo site verification</span>
        <input
          value={form.exoSiteVerification}
          onChange={(e) => set("exoSiteVerification", e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Home H1</span>
        <input value={form.homeH1} onChange={(e) => set("homeH1", e.target.value)} className={inputClass} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Home intro HTML</span>
        <textarea
          rows={5}
          value={form.homeIntroHtml}
          onChange={(e) => set("homeIntroHtml", e.target.value)}
          className={`${inputClass} font-mono text-xs`}
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save SEO"}
      </button>
    </form>
  );
}
