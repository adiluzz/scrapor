"use client";

import { useCallback, useEffect, useState } from "react";
import DetectionClipCard, { type DetectionClip } from "@/components/admin/DetectionClipCard";

const POLL_MS = 3000;

export default function VideoAgentRunReview({
  runId,
  initialStatus,
  initialDetections,
}: {
  runId: string;
  initialStatus: string;
  initialDetections: DetectionClip[];
}) {
  const [status, setStatus] = useState(initialStatus);
  const [detections, setDetections] = useState(initialDetections);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/video-agent/runs/${runId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load run");
    setStatus(data.run.status);
    setDetections(
      data.run.detections.map(
        (d: DetectionClip & { feedback?: { approved: boolean } | null }) => ({
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
          feedback: d.feedback ? { approved: d.feedback.approved } : null,
        })
      )
    );
    return data.run.status as string;
  }, [runId]);

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

  if (status === "PENDING" || status === "RUNNING") {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-sm text-zinc-400">
        Analysis in progress ({status.toLowerCase()})… results will appear here when complete.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {status === "DONE" && detections.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">No detections found for this run.</p>
      )}

      {detections.length > 0 && (
        <>
          <p className="text-sm text-zinc-400">
            Review each clip. Approve correct detections and reject false positives — feedback is
            saved permanently for this analysis and used as training data.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {detections.map((d) => (
              <DetectionClipCard
                key={d.id}
                detection={d}
                onFeedback={submitFeedback}
                busy={feedbackBusy}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
