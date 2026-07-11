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
      const res = await fetch(`/api/admin/sites/${siteId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vastTagUrl: form.vastTagUrl || null,
          adSkipSeconds: form.adSkipSeconds,
          adMinViewSeconds: form.adMinViewSeconds,
          adTimeoutMs: form.adTimeoutMs,
          exoInsClass: form.exoInsClass || null,
          exoZoneHome: form.exoZoneHome || null,
          exoZoneUnderPlayer: form.exoZoneUnderPlayer || null,
          exoZoneVideoFullscreen: form.exoZoneVideoFullscreen || null,
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

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Exo ins class</span>
        <input value={form.exoInsClass} onChange={(e) => set("exoInsClass", e.target.value)} className={inputClass} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Exo zone · home</span>
        <input value={form.exoZoneHome} onChange={(e) => set("exoZoneHome", e.target.value)} className={inputClass} />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Exo zone · under player</span>
        <input
          value={form.exoZoneUnderPlayer}
          onChange={(e) => set("exoZoneUnderPlayer", e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm text-zinc-400">Exo zone · video fullscreen</span>
        <input
          value={form.exoZoneVideoFullscreen}
          onChange={(e) => set("exoZoneVideoFullscreen", e.target.value)}
          className={inputClass}
        />
      </label>

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
