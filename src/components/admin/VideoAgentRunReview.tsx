"use client";

import { useCallback, useEffect, useState } from "react";
import DetectionClipCard, { type DetectionClip } from "@/components/admin/DetectionClipCard";
import ManualClipExtractor from "@/components/admin/ManualClipExtractor";

const POLL_MS = 3000;

type RunVideo = { id: string; title: string; durationSec?: number | null };

export default function VideoAgentRunReview({
  runId,
  initialStatus,
  initialDetections,
  labelOptions,
  runVideos,
}: {
  runId: string;
  initialStatus: string;
  initialDetections: DetectionClip[];
  labelOptions: string[];
  runVideos: RunVideo[];
}) {
  const [status, setStatus] = useState(initialStatus);
  const [detections, setDetections] = useState(initialDetections);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapDetection = useCallback(
    (d: DetectionClip & { feedback?: { approved: boolean } | null; manual?: boolean }) => ({
      id: d.id,
      videoId: d.videoId,
      videoTitle: d.videoTitle,
      label: d.label,
      startSec: d.startSec,
      endSec: d.endSec,
      screenX: d.screenX,
      screenY: d.screenY,
      screenW: d.screenW,
      screenH: d.screenH,
      confidence: d.confidence,
      manual: d.manual ?? false,
      feedback: d.feedback ? { approved: d.feedback.approved } : null,
    }),
    []
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/video-agent/runs/${runId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load run");
    setStatus(data.run.status);
    setDetections(data.run.detections.map(mapDetection));
    return data.run.status as string;
  }, [runId, mapDetection]);

  useEffect(() => {
    if (status === "DONE" || status === "ERROR") return;
    const timer = setInterval(async () => {
      try {
        const next = await refresh();
        if (next === "DONE" || next === "ERROR") clearInterval(timer);
      } catch (e) {
        setError((e as Error).message);
        clearInterval(timer);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, refresh]);

  async function submitFeedback(detectionId: string, approved: boolean) {
    setFeedbackBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/video-agent/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detectionId, approved }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Feedback failed");
      setDetections((prev) =>
        prev.map((d) => (d.id === detectionId ? { ...d, feedback: { approved } } : d))
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function updateDetection(
    detectionId: string,
    patch: { label: string; startSec: number; endSec: number }
  ) {
    setFeedbackBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-agent/detections/${detectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      const d = data.detection;
      setDetections((prev) =>
        prev.map((item) =>
          item.id === detectionId
            ? {
                ...item,
                label: d.label,
                startSec: d.startSec,
                endSec: d.endSec,
              }
            : item
        )
      );
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function deleteDetection(detectionId: string) {
    if (!confirm("Delete this detection?")) return;
    setFeedbackBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/video-agent/detections/${detectionId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setDetections((prev) => prev.filter((d) => d.id !== detectionId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFeedbackBusy(false);
    }
  }

  const inProgress = status === "PENDING" || status === "RUNNING";

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <ManualClipExtractor
        runId={runId}
        labelOptions={labelOptions}
        runVideos={runVideos}
        onAdded={refresh}
      />

      {inProgress && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200/90">
          Analysis in progress ({status.toLowerCase()})…
          {detections.length > 0
            ? ` ${detections.length} detection${detections.length === 1 ? "" : "s"} found so far.`
            : " Detections will appear here as chunks finish."}
        </div>
      )}

      {!inProgress && status === "DONE" && detections.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No detections yet. Use the manual clip tool above to mark clips, or run AI analysis from
          the video agent page.
        </p>
      )}

      {detections.length > 0 && (
        <>
          <p className="text-sm text-zinc-400">
            Review each clip. Edit label or times if the model was off. Approve correct detections
            and reject false positives — feedback is saved for training.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {detections.map((d) => (
              <DetectionClipCard
                key={d.id}
                detection={d}
                onFeedback={submitFeedback}
                onUpdate={updateDetection}
                onDelete={deleteDetection}
                labelOptions={labelOptions}
                busy={feedbackBusy || inProgress}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
