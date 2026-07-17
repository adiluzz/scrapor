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

/** Full-frame crop (effectively no crop when exported). */
export function fullFrameCrop(): EditorCrop {
  return { x: 0, y: 0, w: 1, h: 1, aspect: "free" };
}

export function isFullFrameCrop(crop: EditorCrop | undefined | null): boolean {
  if (!crop) return true;
  return crop.x <= 0.001 && crop.y <= 0.001 && crop.w >= 0.999 && crop.h >= 0.999;
}

export function defaultCrop(aspect: EditorCropAspect = "16:9"): EditorCrop {
  if (aspect === "free") {
    return fullFrameCrop();
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

/** Strip trailing " #2" style suffixes when numbering clips from the same source. */
export function baseClipTitle(title: string): string {
  return title.replace(/\s+#\d+$/, "").trim() || title;
}

/** Title for the Nth clip cut from the same source video. */
export function numberedClipTitle(baseTitle: string, index: number): string {
  const base = baseClipTitle(baseTitle);
  return index <= 1 ? base : `${base} #${index}`;
}

/** Suggest in/out for the next segment after an existing clip on the same source. */
export function suggestNextClipRange(
  sourceDurationSec: number,
  afterSec: number,
  defaultLenSec = 30
): { startSec: number; endSec: number } {
  const dur = sourceDurationSec > 0 ? sourceDurationSec : afterSec + defaultLenSec;
  const startSec = Math.max(0, Math.min(afterSec, dur - MIN_CLIP_DURATION_SEC));
  const endSec = Math.min(dur, startSec + defaultLenSec);
  return {
    startSec,
    endSec: Math.max(endSec, startSec + MIN_CLIP_DURATION_SEC),
  };
}

export const MIN_CLIP_DURATION_SEC = 0.5;
