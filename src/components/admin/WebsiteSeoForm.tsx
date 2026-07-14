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
  juicyAdsSiteVerification: string | null;
  hilltopAdsSiteVerification: string | null;
  homeH1: string | null;
  homeIntroHtml: string | null;
  gaMeasurementId: string | null;
  seoVideoTitleTpl: string | null;
  seoVideoDescTpl: string | null;
  seoPornstarTitleTpl: string | null;
  seoPornstarDescTpl: string | null;
  seoTagTitleTpl: string | null;
  seoTagDescTpl: string | null;
  seoCreatorTitleTpl: string | null;
  seoCreatorDescTpl: string | null;
  seoTagsIndexTitle: string | null;
  seoTagsIndexDesc: string | null;
  seoPornstarsIndexTitle: string | null;
  seoPornstarsIndexDesc: string | null;
  seoCreatorsIndexTitle: string | null;
  seoCreatorsIndexDesc: string | null;
};

const TEMPLATE_HINT =
  "Placeholders: {title} {name} {site} {tagline} {niche} {query} {tags} {duration} {description}";

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
    juicyAdsSiteVerification: initial.juicyAdsSiteVerification || "",
    hilltopAdsSiteVerification: initial.hilltopAdsSiteVerification || "",
    homeH1: initial.homeH1 || "",
    homeIntroHtml: initial.homeIntroHtml || "",
    gaMeasurementId: initial.gaMeasurementId || "",
    seoVideoTitleTpl: initial.seoVideoTitleTpl || "",
    seoVideoDescTpl: initial.seoVideoDescTpl || "",
    seoPornstarTitleTpl: initial.seoPornstarTitleTpl || "",
    seoPornstarDescTpl: initial.seoPornstarDescTpl || "",
    seoTagTitleTpl: initial.seoTagTitleTpl || "",
    seoTagDescTpl: initial.seoTagDescTpl || "",
    seoCreatorTitleTpl: initial.seoCreatorTitleTpl || "",
    seoCreatorDescTpl: initial.seoCreatorDescTpl || "",
    seoTagsIndexTitle: initial.seoTagsIndexTitle || "",
    seoTagsIndexDesc: initial.seoTagsIndexDesc || "",
    seoPornstarsIndexTitle: initial.seoPornstarsIndexTitle || "",
    seoPornstarsIndexDesc: initial.seoPornstarsIndexDesc || "",
    seoCreatorsIndexTitle: initial.seoCreatorsIndexTitle || "",
    seoCreatorsIndexDesc: initial.seoCreatorsIndexDesc || "",
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
      const nullIfEmpty = (v: string) => (v.trim() ? v : null);
      const res = await fetch(`/api/admin/sites/${siteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seoTitle: nullIfEmpty(form.seoTitle),
          seoDescription: nullIfEmpty(form.seoDescription),
          seoKeywords: keywords,
          ogImagePath: nullIfEmpty(form.ogImagePath),
          exoSiteVerification: nullIfEmpty(form.exoSiteVerification),
          juicyAdsSiteVerification: nullIfEmpty(form.juicyAdsSiteVerification),
          hilltopAdsSiteVerification: nullIfEmpty(form.hilltopAdsSiteVerification),
          homeH1: nullIfEmpty(form.homeH1),
          homeIntroHtml: nullIfEmpty(form.homeIntroHtml),
          gaMeasurementId: form.gaMeasurementId.trim() || null,
          seoVideoTitleTpl: nullIfEmpty(form.seoVideoTitleTpl),
          seoVideoDescTpl: nullIfEmpty(form.seoVideoDescTpl),
          seoPornstarTitleTpl: nullIfEmpty(form.seoPornstarTitleTpl),
          seoPornstarDescTpl: nullIfEmpty(form.seoPornstarDescTpl),
          seoTagTitleTpl: nullIfEmpty(form.seoTagTitleTpl),
          seoTagDescTpl: nullIfEmpty(form.seoTagDescTpl),
          seoCreatorTitleTpl: nullIfEmpty(form.seoCreatorTitleTpl),
          seoCreatorDescTpl: nullIfEmpty(form.seoCreatorDescTpl),
          seoTagsIndexTitle: nullIfEmpty(form.seoTagsIndexTitle),
          seoTagsIndexDesc: nullIfEmpty(form.seoTagsIndexDesc),
          seoPornstarsIndexTitle: nullIfEmpty(form.seoPornstarsIndexTitle),
          seoPornstarsIndexDesc: nullIfEmpty(form.seoPornstarsIndexDesc),
          seoCreatorsIndexTitle: nullIfEmpty(form.seoCreatorsIndexTitle),
          seoCreatorsIndexDesc: nullIfEmpty(form.seoCreatorsIndexDesc),
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
    <form onSubmit={submit} className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      {(error || status) && (
        <p
          className={`rounded px-3 py-2 text-sm ${
            error ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {error || status}
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-zinc-200">Home & analytics</legend>

        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Google Analytics 4 measurement ID</span>
          <input
            value={form.gaMeasurementId}
            onChange={(e) => set("gaMeasurementId", e.target.value)}
            placeholder="G-XXXXXXXX"
            className={inputClass}
          />
        </label>

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
            placeholder="Meta content value only"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">JuicyAds site verification</span>
          <input
            value={form.juicyAdsSiteVerification}
            onChange={(e) => set("juicyAdsSiteVerification", e.target.value)}
            className={inputClass}
            placeholder="Content from juicy-ads-site-verification meta"
          />
          <span className="text-xs text-zinc-500">
            Paste only the content value from JuicyAds. Emitted site-wide as meta name
            juicyads-site-verification.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">HilltopAds site verification</span>
          <input
            value={form.hilltopAdsSiteVerification}
            onChange={(e) => set("hilltopAdsSiteVerification", e.target.value)}
            className={inputClass}
            placeholder="Token used as both meta name and content"
          />
          <span className="text-xs text-zinc-500">
            Paste the HilltopAds meta token (name and content are the same). Emitted
            site-wide as that meta tag.
          </span>
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
      </fieldset>

      <fieldset className="space-y-4 border-t border-zinc-800 pt-4">
        <legend className="text-sm font-medium text-zinc-200">Page templates</legend>
        <p className="text-xs text-zinc-500">{TEMPLATE_HINT}</p>

        {(
          [
            ["seoVideoTitleTpl", "Video title template", "e.g. {title} | {site}"],
            ["seoVideoDescTpl", "Video description template", "Used when video has no description"],
            ["seoPornstarTitleTpl", "Pornstar title template", "e.g. {name} Videos | {site}"],
            ["seoPornstarDescTpl", "Pornstar description template", ""],
            ["seoTagTitleTpl", "Tag title template", "e.g. {name} {niche} Videos | {site}"],
            ["seoTagDescTpl", "Tag description template", ""],
            ["seoCreatorTitleTpl", "Creator title template", "Studio sites"],
            ["seoCreatorDescTpl", "Creator description template", ""],
            ["seoTagsIndexTitle", "Tags index title", ""],
            ["seoTagsIndexDesc", "Tags index description", ""],
            ["seoPornstarsIndexTitle", "Pornstars index title", ""],
            ["seoPornstarsIndexDesc", "Pornstars index description", ""],
            ["seoCreatorsIndexTitle", "Creators index title", ""],
            ["seoCreatorsIndexDesc", "Creators index description", ""],
          ] as const
        ).map(([key, label, hint]) => (
          <label key={key} className="block space-y-1.5">
            <span className="text-sm text-zinc-400">{label}</span>
            {key.endsWith("Desc") || key.endsWith("DescTpl") ? (
              <textarea
                rows={2}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={hint}
                className={inputClass}
              />
            ) : (
              <input
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={hint}
                className={inputClass}
              />
            )}
          </label>
        ))}
      </fieldset>

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
