import {
  DEFAULT_VIDEO_AGENT_MODEL,
  resolveVideoAgentModel,
  type VideoAgentModelId,
} from "@/lib/video-agent-models";
import {
  EDITOR_CLIP_MIN_SEC,
  normalizeEditorClipDuration,
  shouldRejectEditorSegment,
} from "@/lib/video-editor-segment-filter";

/** Planner / ranking text call (Nova 2 Lite). */
const PLANNER_COST_USD = 0.01;

/**
 * Approximate Bedrock analysis cost for highlight editing.
 * Uses in-repo per-hour catalog rates (chunked understanding, not generative Reel).
 */
export function estimateVideoEditorCost(input: {
  sourceDurationSec: number;
  targetDurationSec?: number;
  analysisModelId?: string;
}): {
  sourceDurationSec: number;
  targetDurationSec: number;
  analysisModelId: string;
  analysisModelLabel: string;
  breakdown: {
    analysisUsd: number;
    plannerUsd: number;
    renderUsd: number;
  };
  totalUsd: number;
  formula: string;
  wallTimeEstimate: string;
  note: string;
} {
  const sourceDurationSec = Math.max(1, Math.round(input.sourceDurationSec || 0));
  const targetDurationSec = Math.max(1, Math.min(300, Math.round(input.targetDurationSec || 30)));
  const modelId = (input.analysisModelId || DEFAULT_VIDEO_AGENT_MODEL) as VideoAgentModelId;
  const model = resolveVideoAgentModel(modelId) || resolveVideoAgentModel(DEFAULT_VIDEO_AGENT_MODEL);

  const hours = sourceDurationSec / 3600;
  let analysisUsd: number;
  let formula: string;

  if (modelId === "pegasus-1-2") {
    // Bedrock published: $0.00049 / sec video input + output tokens (~estimate $0.30/hr text out)
    const videoIn = sourceDurationSec * 0.00049;
    const tokensOut = 0.3 * hours;
    analysisUsd = Math.round((videoIn + tokensOut) * 100) / 100;
    formula = `${sourceDurationSec}s × $0.00049/s video + ~$${tokensOut.toFixed(2)} output tokens`;
  } else if (modelId === "pegasus-1-5") {
    analysisUsd = Math.round(3.5 * hours * 100) / 100;
    formula = `${hours.toFixed(2)}h × ~$3.50/hr (TwelveLabs direct)`;
  } else {
    // Nova 2 Lite catalog ~$0.40/hr
    const rate = 0.4;
    analysisUsd = Math.round(Math.max(0.05, rate * hours) * 100) / 100;
    formula = `${hours.toFixed(2)}h × ~$${rate.toFixed(2)}/hr (${model?.label || "Nova 2 Lite"})`;
  }

  const plannerUsd = PLANNER_COST_USD;
  const renderUsd = 0;
  const totalUsd = Math.round((analysisUsd + plannerUsd + renderUsd) * 100) / 100;

  const chunks = Math.ceil(sourceDurationSec / 180);
  let wallTime = "~3–8 min";
  if (chunks >= 20) wallTime = "~5–15 min";
  else if (chunks >= 10) wallTime = "~4–12 min";
  else if (chunks <= 2) wallTime = "~1–3 min";

  return {
    sourceDurationSec,
    targetDurationSec,
    analysisModelId: model?.id || modelId,
    analysisModelLabel: model?.label || modelId,
    breakdown: { analysisUsd, plannerUsd, renderUsd },
    totalUsd,
    formula: `${formula} + planner $${plannerUsd.toFixed(2)} + render $0 (FFmpeg/OpenReel)`,
    wallTimeEstimate: wallTime,
    note: `Cuts your source to ~${targetDurationSec}s in ${EDITOR_CLIP_MIN_SEC}–10s moving-video clips. Does not use Nova Reel generative pricing.`,
  };
}

/** Greedy pack detections into a target duration (highest confidence first). */
export function packSegmentsToDuration(
  segments: Array<{
    videoId: string;
    videoTitle?: string;
    startSec: number;
    endSec: number;
    confidence?: number | null;
    label?: string;
    screenX?: number | null;
    screenY?: number | null;
    screenW?: number | null;
    screenH?: number | null;
    sourceDurationSec?: number | null;
  }>,
  targetDurationSec: number
): Array<{
  videoId: string;
  title: string;
  startSec: number;
  endSec: number;
  confidence?: number;
}> {
  const sorted = [...segments]
    .filter((s) => !shouldRejectEditorSegment(s))
    .map((s) => {
      const normalized = normalizeEditorClipDuration(
        s.startSec,
        s.endSec,
        s.sourceDurationSec
      );
      if (!normalized) return null;
      return {
        videoId: s.videoId,
        title: s.videoTitle || s.label || s.videoId,
        startSec: normalized.startSec,
        endSec: normalized.endSec,
        confidence: s.confidence ?? 0.5,
        dur: normalized.endSec - normalized.startSec,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s != null && s.dur >= EDITOR_CLIP_MIN_SEC)
    .sort((a, b) => b.confidence - a.confidence);

  const out: Array<{
    videoId: string;
    title: string;
    startSec: number;
    endSec: number;
    confidence?: number;
  }> = [];
  let used = 0;
  for (const s of sorted) {
    if (used >= targetDurationSec) break;
    if (used + s.dur > targetDurationSec) continue;
    out.push({
      videoId: s.videoId,
      title: s.title,
      startSec: s.startSec,
      endSec: s.endSec,
      confidence: s.confidence,
    });
    used += s.dur;
  }
  // Prefer chronological order for playback
  return out.sort((a, b) => a.startSec - b.startSec || a.videoId.localeCompare(b.videoId));
}
