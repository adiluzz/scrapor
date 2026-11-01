"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ApprovedClipGrid, { type ApprovedClip } from "@/components/admin/ApprovedClipGrid";

type SiteRow = { id: string; name: string; kind: string };
type ReviewTab = "pending" | "approved";

function pageFromSearch(searchParams: { get(name: string): string | null }): number {
  const n = parseInt(searchParams.get("page") || "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default function AdClipsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialReview = searchParams.get("review") === "approved" ? "approved" : "pending";

  const [clips, setClips] = useState<ApprovedClip[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState(searchParams.get("siteId") ?? "");
  const [review, setReview] = useState<ReviewTab>(initialReview);
  const [page, setPage] = useState(() => pageFromSearch(searchParams));
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [compiledOnly, setCompiledOnly] = useState(searchParams.get("compiled") === "1");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [searchDraft, setSearchDraft] = useState(searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const requestSeq = useRef(0);

  useEffect(() => {
    document.title = "Ad clips · Admin";
  }, []);

  useEffect(() => {
    setReview(initialReview);
  }, [initialReview]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/sites");
      const data = await res.json();
      if (!res.ok) return;
      const list = ((data.sites || []) as SiteRow[]).filter(
        (s) => s.kind === "TUBE" || s.kind === "STUDIO"
      );
      setSites(list);
    })();
  }, []);

  const loadClips = useCallback(async () => {
    const seq = ++requestSeq.current;
    let clamped = false;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (siteId) params.set("siteId", siteId);
      params.set("review", review);
      params.set("page", String(page));
      if (review === "pending" && compiledOnly) params.set("compiled", "1");
      if (review === "approved" && query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/promo-ads/clips?${params}`);
      const data = await res.json();
      if (seq !== requestSeq.current) return;
      if (!res.ok) throw new Error(data.error || "Failed to load clips");
      const nextTotalPages =
        typeof data.totalPages === "number" && data.totalPages > 0 ? data.totalPages : 1;
      if (page > nextTotalPages) {
        clamped = true;
        setPage(nextTotalPages);
        return;
      }
      setClips(data.clips ?? []);
      setTotal(typeof data.total === "number" ? data.total : (data.clips?.length ?? 0));
      setTotalPages(nextTotalPages);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (seq === requestSeq.current && !clamped) setLoading(false);
    }
  }, [siteId, review, page, compiledOnly, query]);

  useEffect(() => {
    void loadClips();
  }, [loadClips]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (siteId) params.set("siteId", siteId);
    if (review === "approved") params.set("review", "approved");
    if (page > 1) params.set("page", String(page));
    if (review === "pending" && compiledOnly) params.set("compiled", "1");
    if (review === "approved" && query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    const next = qs ? `/admin/ad-clips?${qs}` : "/admin/ad-clips";
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== next) router.replace(next, { scroll: false });
  }, [siteId, review, page, compiledOnly, query, router]);

  function setReviewTab(next: ReviewTab) {
    setReview(next);
    setPage(1);
    setSelectedIds(new Set());
  }

  function goToPage(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openInEditor() {
    if (selectedIds.size === 0) return;
    const qs = new URLSearchParams({
      detections: Array.from(selectedIds).join(","),
    });
    router.push(`/admin/video-editor?${qs}`);
  }

  async function submitFeedback(detectionId: string, approved: boolean) {
    setFeedbackBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/video-agent/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ detectionId, approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Feedback failed");
      await loadClips();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feedback failed");
    } finally {
      setFeedbackBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Ad clips</h1>
          <p className="mt-1 text-sm text-zinc-400">
            AI picks land in <strong className="font-medium text-zinc-300">Pending review</strong>{" "}
            until you approve or reject them (saved for model training). Approved clips can be
            compiled or published from here.
          </p>
        </div>
        <Link
          href="/admin/video-editor"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          Open video editor
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex rounded-lg border border-zinc-700 p-0.5">
          <button
            type="button"
            onClick={() => setReviewTab("pending")}
            className={`rounded-md px-4 py-2 text-sm ${
              review === "pending"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Pending review
          </button>
          <button
            type="button"
            onClick={() => setReviewTab("approved")}
            className={`rounded-md px-4 py-2 text-sm ${
              review === "approved"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Approved
          </button>
        </div>

        {sites.length > 0 && (
          <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
            <span className="text-zinc-500">Filter by site</span>
            <select
              value={siteId}
              onChange={(e) => {
                setSiteId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            >
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {review === "pending" && (
          <label className="flex items-center gap-2 pb-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={compiledOnly}
              onChange={(e) => {
                setCompiledOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-zinc-600"
            />
            Compiled only
          </label>
        )}

        {review === "approved" && (
          <form
            className="flex min-w-[16rem] flex-1 items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(searchDraft.trim());
              setPage(1);
            }}
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <span className="text-zinc-500">Search</span>
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search title or label…"
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
            >
              Search
            </button>
          </form>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!loading && (
        <p className="text-sm text-zinc-500">
          {total} clip{total === 1 ? "" : "s"}
          {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ""}
        </p>
      )}

      {review === "pending" && !loading && clips.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-500">
          {compiledOnly
            ? "No compiled clips waiting for review."
            : "No clips waiting for review. Run AI analysis in the Video editor — new picks will appear here for approve/reject before they enter your approved library."}
        </p>
      )}

      {review === "approved" && !loading && clips.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-500">
          {query.trim()
            ? `No approved clips match “${query.trim()}”.`
            : "No approved clips yet. Review AI picks under Pending review — approved clips appear here for compile, publish, and reuse in promo ads."}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading clips…</p>
      ) : clips.length > 0 ? (
        <ApprovedClipGrid
          clips={clips}
          selectedIds={selectedIds}
          onToggle={toggle}
          sites={sites}
          onClipsUpdated={() => void loadClips()}
          showReviewControls={review === "pending"}
          onFeedback={submitFeedback}
          feedbackBusy={feedbackBusy}
        />
      ) : null}

      {!loading && totalPages > 1 && (
        <div
          className={`flex items-center justify-center gap-3 text-sm ${
            review === "approved" && selectedIds.size > 0 ? "mb-24" : ""
          }`}
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-zinc-500">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {review === "approved" && selectedIds.size > 0 && (
        <div className="sticky bottom-0 rounded-xl border border-zinc-700 bg-zinc-900/95 p-4 backdrop-blur">
          <p className="mb-3 text-sm text-zinc-300">
            {selectedIds.size} clip{selectedIds.size === 1 ? "" : "s"} selected
          </p>
          <button
            type="button"
            onClick={openInEditor}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            Open in video editor
          </button>
        </div>
      )}
    </div>
  );
}
