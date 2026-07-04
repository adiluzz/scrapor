"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AdRow = {
  id: string;
  title: string | null;
  status: string;
  generationMode: string;
  generativeModelId: string | null;
  createdAt: string;
  _count: { clips: number; iterations: number };
  iterations: {
    iterationNumber: number;
    status: string;
    estimatedCostUsd: number | null;
  }[];
};

export default function AdsListPage() {
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Promo ads · Admin";
  }, []);

  useEffect(() => {
    fetch("/api/promo-ads")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load");
        setAds(d.ads ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Promo ads</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Browse generated ads and iteration history.
          </p>
        </div>
        <Link
          href="/admin/ad-clips"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          New from clips
        </Link>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading…</p>}

      {!loading && ads.length === 0 && (
        <p className="text-sm text-zinc-500">No promo ads yet.</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Clips</th>
              <th className="px-4 py-3">Iterations</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {ads.map((ad) => {
              const latest = ad.iterations[0];
              return (
                <tr key={ad.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/ads/${ad.id}`}
                      className="font-medium text-brand-300 hover:text-brand-200"
                    >
                      {ad.title || "Untitled"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {ad.generationMode === "CLIP_COMPOSE" ? "Clip compose" : "AI"}
                    {ad.generativeModelId && (
                      <span className="block text-xs text-zinc-600">{ad.generativeModelId}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        ad.status === "DONE"
                          ? "text-emerald-400"
                          : ad.status === "ERROR"
                            ? "text-red-400"
                            : ad.status === "GENERATING"
                              ? "text-amber-400"
                              : "text-zinc-400"
                      }
                    >
                      {ad.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{ad._count.clips}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {ad._count.iterations}
                    {latest?.estimatedCostUsd != null && latest.estimatedCostUsd > 0 && (
                      <span className="block text-xs">${latest.estimatedCostUsd.toFixed(2)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {new Date(ad.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
