"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ApprovedClipGrid, { type ApprovedClip } from "@/components/admin/ApprovedClipGrid";

type SiteRow = { id: string; name: string; kind: string };
type ReviewTab = "pending" | "approved";

export default function AdClipsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialReview = searchParams.get("review") === "approved" ? "approved" : "pending";

  const [clips, setClips] = useState<ApprovedClip[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState("");
  const [review, setReview] = useState<ReviewTab>(initialReview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [feedbackBusy, setFeedbackBusy] = useState(false);

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
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (siteId) params.set("siteId", siteId);
      params.set("review", review);
      const res = await fetch(`/api/promo-ads/clips?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load clips");
      setClips(data.clips ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [siteId, review]);

  useEffect(() => {
    void loadClips();
  }, [loadClips]);

  function setReviewTab(next: ReviewTab) {
    setReview(next);
    setSelectedIds(new Set());
    const params = new URLSearchParams();
    if (siteId) params.set("siteId", siteId);
    if (next === "approved") params.set("review", "approved");
    const qs = params.toString();
    router.replace(qs ? `/admin/ad-clips?${qs}` : "/admin/ad-clips");
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
              onChange={(e) => setSiteId(e.target.value)}
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
      </div>

      {error && (
        <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {review === "pending" && !loading && clips.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-500">
          No clips waiting for review. Run AI analysis in the Video editor — new picks will appear
          here for approve/reject before they enter your approved library.
        </p>
      )}

      {review === "approved" && !loading && clips.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-500">
          No approved clips yet. Review AI picks under Pending review — approved clips appear here
          for compile, publish, and reuse in promo ads.
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
