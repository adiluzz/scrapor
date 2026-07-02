"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SOURCE_SITES } from "@/lib/source-sites";

export default function NewRunForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<string[]>([...SOURCE_SITES]);
  const [minMinutes, setMinMinutes] = useState(10);
  const [maxPerSite, setMaxPerSite] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggle(s: string) {
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const trimmed = maxPerSite.trim();
      const parsedMax = trimmed === "" ? null : Math.max(1, parseInt(trimmed, 10) || 0);
      const res = await fetch("/api/admin/scrape-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          sources,
          minDurationSec: minMinutes * 60,
          maxPerSite: parsedMax,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      router.push(`/admin/scrape-runs/${data.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-lg font-semibold text-white">New scrape run</h2>
      {error && <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      <input required placeholder="Search query (e.g. milf)" value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none" />

      <div>
        <p className="mb-2 text-sm text-zinc-400">Source sites</p>
        <div className="flex flex-wrap gap-2">
          {SOURCE_SITES.map((s) => (
            <label key={s}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                sources.includes(s)
                  ? "border-brand-500 bg-brand-600/20 text-brand-200"
                  : "border-zinc-700 bg-zinc-950 text-zinc-400"
              }`}>
              <input type="checkbox" className="hidden" checked={sources.includes(s)} onChange={() => toggle(s)} />
              {s}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-400">
        Minimum duration
        <input type="number" min={0} max={600} value={minMinutes}
          onChange={(e) => setMinMinutes(parseInt(e.target.value || "0", 10))}
          className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-white focus:border-brand-500 focus:outline-none" />
        minutes
      </label>

      <div>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Videos per site
          <input type="number" min={1} placeholder="all" value={maxPerSite}
            onChange={(e) => setMaxPerSite(e.target.value)}
            className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-white focus:border-brand-500 focus:outline-none" />
        </label>
        <p className="mt-1 text-xs text-zinc-600">
          Leave empty to download <span className="text-zinc-400">all</span> results for the query (paginates every site).
        </p>
      </div>

      <button disabled={loading || sources.length === 0} type="submit"
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50">
        {loading ? "Queuing…" : "Queue run"}
      </button>
    </form>
  );
}
