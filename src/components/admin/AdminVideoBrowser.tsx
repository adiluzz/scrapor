"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoCardData } from "@/lib/queries";
import VideoGrid from "@/components/site/VideoGrid";
import AdminVideoRow from "@/components/admin/AdminVideoRow";

type SiteChip = {
  id: string;
  name: string;
  primaryColor: string;
  suspended: boolean;
};

export type AdminVideoListRow = {
  id: string;
  title: string;
  slug: string;
  isDeleted: boolean;
  viewCount: number;
  sourceSite: string | null;
  sites: SiteChip[];
};

type SuspensionFilter = "" | "visible" | "suspended";

export default function AdminVideoBrowser({
  rows,
  cards,
  view,
  scopeSiteId,
  scopeSiteName,
  total,
  q,
  orphans,
  suspension,
  viewsSortHref,
  viewsSortActive,
  viewsSortMark,
}: {
  rows: AdminVideoListRow[];
  cards: VideoCardData[];
  view: "table" | "grid";
  scopeSiteId: string;
  scopeSiteName: string;
  total: number;
  q: string;
  orphans: boolean;
  suspension: SuspensionFilter;
  viewsSortHref: string;
  viewsSortActive: boolean;
  viewsSortMark: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starQuery, setStarQuery] = useState("");
  const [starHits, setStarHits] = useState<
    { id: string; name: string; slug: string; videoCount: number }[]
  >([]);
  const [pickedStar, setPickedStar] = useState<{
    id: string;
    name: string;
    slug: string;
    videoCount: number;
  } | null>(null);

  useEffect(() => {
    const q = starQuery.trim();
    if (q.length < 2 || (pickedStar && q === pickedStar.name)) {
      setStarHits([]);
      return;
    }
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ q, limit: "8" });
      fetch(`/api/admin/pornstars?${params}`)
        .then((res) => res.json())
        .then((data) => {
          setStarHits(
            (data.pornstars ?? []).map(
              (star: { id: string; name: string; slug: string; videoCount: number }) => ({
                id: star.id,
                name: star.name,
                slug: star.slug,
                videoCount: star.videoCount ?? 0,
              })
            )
          );
        })
        .catch(() => setStarHits([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [starQuery, pickedStar]);

  const pageIds = rows.map((row) => row.id);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const scopeLabel = scopeSiteName ? `on ${scopeSiteName}` : "on every site they are published on";

  const badges = useMemo(() => {
    const next: Record<string, string> = {};
    for (const row of rows) {
      const relevant = scopeSiteId ? row.sites.filter((site) => site.id === scopeSiteId) : row.sites;
      const suspendedCount = relevant.filter((site) => site.suspended).length;
      if (suspendedCount === 0) continue;
      next[row.id] = suspendedCount === relevant.length ? "Suspended" : "Partial";
    }
    return next;
  }, [rows, scopeSiteId]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function apply(suspended: boolean, allMatching: boolean) {
    const verb = suspended ? "Suspend" : "Unsuspend";
    const target = allMatching
      ? `all ${total} video${total === 1 ? "" : "s"} matching this filter`
      : `${selected.length} selected video${selected.length === 1 ? "" : "s"}`;
    if (
      !confirm(
        `${verb} ${target} ${scopeLabel}? The slug and URL stay. Suspended pages return a 404 with a link to the homepage.`
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/videos/suspension", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          suspended,
          ...(scopeSiteId ? { siteId: scopeSiteId } : {}),
          ...(allMatching
            ? {
                allMatching: {
                  ...(q ? { q } : {}),
                  ...(scopeSiteId ? { siteId: scopeSiteId } : {}),
                  ...(orphans ? { orphans: true } : {}),
                  ...(suspension ? { suspension } : {}),
                },
              }
            : { videoIds: selected }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setMessage(
        `${suspended ? "Suspended" : "Unsuspended"} ${data.updated} site listing${data.updated === 1 ? "" : "s"}.`
      );
      setSelected([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function assignPornstar() {
    if (!pickedStar || selected.length === 0) return;
    if (
      !confirm(
        `Assign ${pickedStar.name} (/${pickedStar.slug}) to ${selected.length} selected video${selected.length === 1 ? "" : "s"}? Other pornstars on those videos stay.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/pornstars/${pickedStar.id}/videos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoIds: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assign failed");
      const linked = data.linked ?? 0;
      const already = data.alreadyLinked ?? 0;
      setMessage(
        `Assigned ${pickedStar.name} to ${linked} video${linked === 1 ? "" : "s"}` +
          (already ? ` (${already} already linked)` : "") +
          "."
      );
      setSelected([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || pageIds.length === 0}
          onClick={() => setSelected(allPageSelected ? [] : pageIds)}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        >
          {allPageSelected ? "Clear page" : "Select page"}
        </button>
        <span className="text-xs text-zinc-500">{selected.length} selected</span>
        <button
          type="button"
          disabled={busy || selected.length === 0 || orphans}
          onClick={() => apply(true, false)}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-black hover:bg-amber-500 disabled:opacity-50"
        >
          Suspend selected
        </button>
        <button
          type="button"
          disabled={busy || selected.length === 0 || orphans}
          onClick={() => apply(false, false)}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          Unsuspend selected
        </button>
        <div className="relative">
          <input
            value={starQuery}
            onChange={(e) => {
              setStarQuery(e.target.value);
              setPickedStar(null);
            }}
            placeholder="Assign pornstar…"
            className="w-44 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none"
          />
          {pickedStar && (
            <p className="mt-1 max-w-44 truncate text-[11px] text-zinc-500">
              /{pickedStar.slug} · {pickedStar.videoCount} video
              {pickedStar.videoCount === 1 ? "" : "s"}
            </p>
          )}
          {starHits.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-56 w-72 overflow-auto rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl">
              {starHits.map((star) => (
                <li key={star.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900"
                    onClick={() => {
                      setPickedStar(star);
                      setStarQuery(star.name);
                      setStarHits([]);
                    }}
                  >
                    {star.name}
                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                      /{star.slug} · {star.videoCount} video{star.videoCount === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          disabled={busy || selected.length === 0 || !pickedStar}
          onClick={assignPornstar}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs text-white hover:bg-brand-500 disabled:opacity-50"
        >
          Assign to selected
        </button>
        <button
          type="button"
          disabled={busy || total === 0 || orphans}
          onClick={() => apply(true, true)}
          className="rounded-lg border border-amber-700 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-950/40 disabled:opacity-50"
        >
          Suspend all {total} matching
        </button>
        <button
          type="button"
          disabled={busy || total === 0 || orphans}
          onClick={() => apply(false, true)}
          className="rounded-lg border border-emerald-800 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
        >
          Unsuspend all {total} matching
        </button>
        <span className="text-xs text-zinc-500">
          {orphans
            ? "Orphans are not published on a site."
            : `Applies ${scopeLabel}. Slugs stay the same.`}
        </span>
      </div>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
      {message && <p className="mb-3 text-sm text-emerald-400">{message}</p>}

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">No videos.</p>
      ) : view === "grid" ? (
        <VideoGrid
          videos={cards}
          hrefPrefix="/admin/videos"
          hrefBy="id"
          selectedIds={selectedSet}
          onToggleSelect={toggle}
          badges={badges}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    aria-label="Select all videos on this page"
                    onChange={() => setSelected(allPageSelected ? [] : pageIds)}
                    className="h-4 w-4 accent-brand-500"
                  />
                </th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Sites</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">
                  <Link
                    href={viewsSortHref}
                    className={`inline-flex items-center gap-1 hover:text-white ${
                      viewsSortActive ? "text-white" : ""
                    }`}
                    title={viewsSortMark === "↓" ? "Show fewest views first" : "Show most views first"}
                  >
                    Views{viewsSortMark ? ` ${viewsSortMark}` : ""}
                  </Link>
                </th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((video) => (
                <AdminVideoRow
                  key={video.id}
                  video={video}
                  sites={video.sites}
                  filterSiteId={scopeSiteId}
                  selected={selectedSet.has(video.id)}
                  onToggleSelected={() => toggle(video.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
