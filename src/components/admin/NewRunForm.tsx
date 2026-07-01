"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SOURCE_SITES } from "@/lib/source-sites";

export default function NewRunForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<string[]>([...SOURCE_SITES]);
  const [minMinutes, setMinMinutes] = useState(10);
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
      const res = await fetch("/api/admin/scrape-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, sources, minDurationSec: minMinutes * 60 }),
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
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none" />

      <div>
        <p className="mb-2 text-sm text-zinc-400">Source sites</p>
        <div className="flex flex-wrap gap-2">
          {SOURCE_SITES.map((s) => (
            <label key={s}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                sources.includes(s)
                  ? "border-pink-500 bg-pink-600/20 text-pink-200"
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
          className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-white focus:border-pink-500 focus:outline-none" />
        minutes
      </label>

      <button disabled={loading || sources.length === 0} type="submit"
        className="rounded-lg bg-pink-600 px-5 py-2.5 font-medium text-white hover:bg-pink-500 disabled:opacity-50">
        {loading ? "Queuing…" : "Queue run"}
      </button>
    </form>
  );
}
