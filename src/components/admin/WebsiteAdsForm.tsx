"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none";

type AdsFields = {
  vastTagUrl: string | null;
  adSkipSeconds: number;
  adMinViewSeconds: number;
  adTimeoutMs: number;
  exoInsClass: string | null;
  exoZoneHome: string | null;
  exoZoneUnderPlayer: string | null;
  exoZoneVideoFullscreen: string | null;
  exoZoneGridNative: string | null;
  exoZoneMobileSticky: string | null;
  exoZonePopunder: string | null;
  exoZoneMidList: string | null;
  juicyAdsSiteId: string | null;
  juicyAdsZoneBanner: string | null;
  juicyAdsZoneNative: string | null;
  stripchatWidgetId: string | null;
  stripchatAffiliateUrl: string | null;
  adsPopunderEnabled: boolean;
  adsJuicyEnabled: boolean;
  adsCamWidgetEnabled: boolean;
};

export default function WebsiteAdsForm({
  siteId,
  initial,
}: {
  siteId: string;
  initial: AdsFields;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    vastTagUrl: initial.vastTagUrl || "",
    adSkipSeconds: initial.adSkipSeconds,
    adMinViewSeconds: initial.adMinViewSeconds,
    adTimeoutMs: initial.adTimeoutMs,
    exoInsClass: initial.exoInsClass || "",
    exoZoneHome: initial.exoZoneHome || "",
    exoZoneUnderPlayer: initial.exoZoneUnderPlayer || "",
    exoZoneVideoFullscreen: initial.exoZoneVideoFullscreen || "",
    exoZoneGridNative: initial.exoZoneGridNative || "",
    exoZoneMobileSticky: initial.exoZoneMobileSticky || "",
    exoZonePopunder: initial.exoZonePopunder || "",
    exoZoneMidList: initial.exoZoneMidList || "",
    juicyAdsSiteId: initial.juicyAdsSiteId || "",
    juicyAdsZoneBanner: initial.juicyAdsZoneBanner || "",
    juicyAdsZoneNative: initial.juicyAdsZoneNative || "",
    stripchatWidgetId: initial.stripchatWidgetId || "",
    stripchatAffiliateUrl: initial.stripchatAffiliateUrl || "",
    adsPopunderEnabled: initial.adsPopunderEnabled,
    adsJuicyEnabled: initial.adsJuicyEnabled,
    adsCamWidgetEnabled: initial.adsCamWidgetEnabled,
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
      const empty = (v: string) => v.trim() || null;
      const res = await fetch(`/api/admin/sites/${siteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vastTagUrl: empty(form.vastTagUrl),
          adSkipSeconds: form.adSkipSeconds,
          adMinViewSeconds: form.adMinViewSeconds,
          adTimeoutMs: form.adTimeoutMs,
          exoInsClass: empty(form.exoInsClass),
          exoZoneHome: empty(form.exoZoneHome),
          exoZoneUnderPlayer: empty(form.exoZoneUnderPlayer),
          exoZoneVideoFullscreen: empty(form.exoZoneVideoFullscreen),
          exoZoneGridNative: empty(form.exoZoneGridNative),
          exoZoneMobileSticky: empty(form.exoZoneMobileSticky),
          exoZonePopunder: empty(form.exoZonePopunder),
          exoZoneMidList: empty(form.exoZoneMidList),
          juicyAdsSiteId: empty(form.juicyAdsSiteId),
          juicyAdsZoneBanner: empty(form.juicyAdsZoneBanner),
          juicyAdsZoneNative: empty(form.juicyAdsZoneNative),
          stripchatWidgetId: empty(form.stripchatWidgetId),
          stripchatAffiliateUrl: empty(form.stripchatAffiliateUrl),
          adsPopunderEnabled: form.adsPopunderEnabled,
          adsJuicyEnabled: form.adsJuicyEnabled,
          adsCamWidgetEnabled: form.adsCamWidgetEnabled,
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
        <legend className="text-sm font-medium text-zinc-200">VAST pre-roll</legend>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">VAST tag URL</span>
          <input value={form.vastTagUrl} onChange={(e) => set("vastTagUrl", e.target.value)} className={inputClass} />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-400">Skip (sec)</span>
            <input
              type="number"
              min={0}
              value={form.adSkipSeconds}
              onChange={(e) => set("adSkipSeconds", parseInt(e.target.value || "0", 10))}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-400">Min view (sec)</span>
            <input
              type="number"
              min={0}
              value={form.adMinViewSeconds}
              onChange={(e) => set("adMinViewSeconds", parseInt(e.target.value || "0", 10))}
              className={inputClass}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-400">Timeout (ms)</span>
            <input
              type="number"
              min={0}
              value={form.adTimeoutMs}
              onChange={(e) => set("adTimeoutMs", parseInt(e.target.value || "0", 10))}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="space-y-4 border-t border-zinc-800 pt-4">
        <legend className="text-sm font-medium text-zinc-200">ExoClick zones</legend>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Exo ins class</span>
          <input value={form.exoInsClass} onChange={(e) => set("exoInsClass", e.target.value)} className={inputClass} />
        </label>
        {(
          [
            ["exoZoneHome", "Home banner / native"],
            ["exoZoneUnderPlayer", "Under player"],
            ["exoZoneVideoFullscreen", "Fullpage interstitial"],
            ["exoZoneGridNative", "In-grid native"],
            ["exoZoneMidList", "Mid-list native (optional; falls back to grid)"],
            ["exoZoneMobileSticky", "Mobile sticky banner"],
            ["exoZonePopunder", "Popunder (session-capped on first video play)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block space-y-1.5">
            <span className="text-sm text-zinc-400">{label}</span>
            <input value={form[key]} onChange={(e) => set(key, e.target.value)} className={inputClass} />
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.adsPopunderEnabled}
            onChange={(e) => set("adsPopunderEnabled", e.target.checked)}
            className="rounded border-zinc-600"
          />
          Enable popunder (once per session on first video play)
        </label>
      </fieldset>

      <fieldset className="space-y-4 border-t border-zinc-800 pt-4">
        <legend className="text-sm font-medium text-zinc-200">JuicyAds (fill)</legend>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.adsJuicyEnabled}
            onChange={(e) => set("adsJuicyEnabled", e.target.checked)}
            className="rounded border-zinc-600"
          />
          Enable JuicyAds fallback slots
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">JuicyAds site ID</span>
          <input value={form.juicyAdsSiteId} onChange={(e) => set("juicyAdsSiteId", e.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">JuicyAds banner zone ID</span>
          <input
            value={form.juicyAdsZoneBanner}
            onChange={(e) => set("juicyAdsZoneBanner", e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">JuicyAds native zone ID</span>
          <input
            value={form.juicyAdsZoneNative}
            onChange={(e) => set("juicyAdsZoneNative", e.target.value)}
            className={inputClass}
          />
        </label>
      </fieldset>

      <fieldset className="space-y-4 border-t border-zinc-800 pt-4">
        <legend className="text-sm font-medium text-zinc-200">Stripchat cam widget</legend>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.adsCamWidgetEnabled}
            onChange={(e) => set("adsCamWidgetEnabled", e.target.checked)}
            className="rounded border-zinc-600"
          />
          Enable Stripchat widget on video pages
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Stripchat widget ID</span>
          <input
            value={form.stripchatWidgetId}
            onChange={(e) => set("stripchatWidgetId", e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Stripchat affiliate URL (fallback if no widget ID)</span>
          <input
            value={form.stripchatAffiliateUrl}
            onChange={(e) => set("stripchatAffiliateUrl", e.target.value)}
            className={inputClass}
          />
        </label>
      </fieldset>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save ad settings"}
      </button>
    </form>
  );
}
