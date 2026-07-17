/** Normalized crop box relative to source frame (0–1). */
export type EditorCropAspect = "16:9" | "9:16" | "1:1" | "4:5" | "free";

export type EditorCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
  aspect: EditorCropAspect;
};

/** Timeline clip — references library video with in/out points (seconds). */
export type EditorClip = {
  id: string;
  videoId: string;
  title: string;
  startSec: number;
  endSec: number;
  crop?: EditorCrop;
};

export type LibraryVideo = {
  id: string;
  title: string;
  slug: string;
  durationSec: number | null;
  status: string;
};

export const ASPECT_RATIOS: Record<Exclude<EditorCropAspect, "free">, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:5": 4 / 5,
};

export function defaultCrop(aspect: EditorCropAspect = "16:9"): EditorCrop {
  if (aspect === "free") {
    return { x: 0, y: 0, w: 1, h: 1, aspect: "free" };
  }
  const target = ASPECT_RATIOS[aspect];
  // Assume source is roughly 16:9 for default framing; center-crop to aspect.
  const srcAspect = 16 / 9;
  if (target >= srcAspect) {
    const h = srcAspect / target;
    return { x: 0, y: (1 - h) / 2, w: 1, h, aspect };
  }
  const w = target / srcAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1, aspect };
}

export function clipDurationSec(clip: EditorClip): number {
  return Math.max(0, clip.endSec - clip.startSec);
}

export function totalTimelineDuration(clips: EditorClip[]): number {
  return clips.reduce((sum, c) => sum + clipDurationSec(c), 0);
}

export function segmentsFromClips(clips: EditorClip[]) {
  return clips.map((c) => ({
    videoId: c.videoId,
    title: c.title,
    startSec: c.startSec,
    endSec: c.endSec,
    crop: c.crop,
  }));
}

export function newClipId(videoId: string): string {
  return `${videoId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const MIN_CLIP_DURATION_SEC = 0.5;
