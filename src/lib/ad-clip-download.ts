import { MAX_EDITOR_CLIP_DURATION_SEC } from "@/lib/video-editor-limits";

export function adClipDownloadFilename(title: string, label: string): string {
  const base =
    title
      .replace(/[^\w\s.-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "ad-clip";
  const suffix = label === "compiled" ? "" : `-${label.replace(/[^\w-]+/g, "")}`;
  return `${base}${suffix}.mp4`;
}

export function adClipGifDownloadFilename(title: string, label: string): string {
  return adClipDownloadFilename(title, label).replace(/\.mp4$/, ".gif");
}

/** Admin download URL for an ad clip (compiled full file or trimmed segment). */
export function adClipDownloadUrl(clip: {
  videoId: string;
  label: string;
  startSec: number;
  endSec: number;
}): string {
  const duration = Math.max(0, clip.endSec - clip.startSec);

  if (clip.label === "compiled") {
    return `/api/admin/videos/${clip.videoId}/stream?download=1`;
  }

  if (duration > 0 && duration <= MAX_EDITOR_CLIP_DURATION_SEC) {
    const qs = new URLSearchParams({
      startSec: String(clip.startSec),
      endSec: String(clip.endSec),
      download: "1",
    });
    return `/api/admin/videos/${clip.videoId}/editor-clip?${qs}`;
  }

  return `/api/admin/videos/${clip.videoId}/stream?download=1`;
}

/** Admin GIF download URL for an ad clip segment. */
export function adClipGifDownloadUrl(clip: {
  videoId: string;
  startSec: number;
  endSec: number;
}): string {
  const qs = new URLSearchParams({
    startSec: String(clip.startSec),
    endSec: String(clip.endSec),
    download: "1",
  });
  return `/api/admin/videos/${clip.videoId}/editor-clip-gif?${qs}`;
}
