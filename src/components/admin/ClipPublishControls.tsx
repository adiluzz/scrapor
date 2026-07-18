"use client";

import { useState } from "react";
import Link from "next/link";

type SiteOption = { id: string; name: string; domain?: string };

type PublishedSite = { id: string; name: string; domain: string };

export default function ClipPublishControls({
  detectionId,
  videoId,
  videoSlug,
  canPublish,
  videoStatus,
  publishedSites,
  sites,
  defaultSiteId,
  onUpdated,
}: {
  detectionId: string;
  videoId: string;
  videoSlug?: string | null;
  canPublish: boolean;
  videoStatus: string | null;
  publishedSites: PublishedSite[];
  sites: SiteOption[];
  defaultSiteId?: string;
  onUpdated: () => void;
}) {
  const [siteId, setSiteId] = useState(defaultSiteId || sites[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canPublish) return null;

  async function publish() {
    if (!siteId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ad-clips/${detectionId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteIds: [siteId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish(targetSiteId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/ad-clips/${detectionId}/publish?siteId=${encodeURIComponent(targetSiteId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unpublish failed");
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unpublish failed");
    } finally {
      setBusy(false);
    }
  }

  const isLive = publishedSites.length > 0 && videoStatus === "READY";

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Site</span>
        {isLive ? (
          <span className="rounded bg-emerald-950/80 px-1.5 py-0.5 text-[10px] text-emerald-300">
            Live
          </span>
        ) : (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">Draft</span>
        )}
      </div>

      {publishedSites.length > 0 && (
        <ul className="space-y-1">
          {publishedSites.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 text-[11px] text-zinc-300"
            >
              <span>{s.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void unpublish(s.id)}
                className="text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          disabled={busy || sites.length === 0}
          className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-white"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !siteId}
          onClick={() => void publish()}
          className="rounded bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? "…" : "Publish"}
        </button>
      </div>

      {videoSlug ? (
        <Link
          href={`/admin/videos/${videoSlug}`}
          className="inline-block text-[10px] text-zinc-500 underline hover:text-zinc-300"
        >
          Open in Videos admin
        </Link>
      ) : null}

      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
