import { VIDEO_AGENT_MODEL_CATALOG } from "@/lib/video-agent-models";

export const RUN_STATUS_COLORS: Record<string, string> = {
  PENDING: "text-zinc-400",
  RUNNING: "text-yellow-400",
  DONE: "text-emerald-400",
  ERROR: "text-red-400",
};

export function modelLabel(id: string): string {
  return VIDEO_AGENT_MODEL_CATALOG.find((m) => m.id === id)?.label ?? id;
}

export function parseRunTargets(extractTargets: string): string[] {
  try {
    const parsed = JSON.parse(extractTargets);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function parseSelectedVideoIds(selectedVideoIds: string | null | undefined): string[] {
  if (!selectedVideoIds) return [];
  try {
    const parsed = JSON.parse(selectedVideoIds);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export type FeedbackStats = {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
};

export function feedbackStats(
  detections: { feedback: { approved: boolean } | null }[]
): FeedbackStats {
  let approved = 0;
  let rejected = 0;
  for (const d of detections) {
    if (d.feedback?.approved === true) approved++;
    else if (d.feedback?.approved === false) rejected++;
  }
  const total = detections.length;
  return { total, approved, rejected, pending: total - approved - rejected };
}

export function truncatePrompt(prompt: string, max = 80): string {
  const t = prompt.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
