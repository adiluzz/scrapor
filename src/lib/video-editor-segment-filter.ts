/** Editor AI segment constraints — keep in sync with video-analyzer/filters.py where noted. */

export const EDITOR_CLIP_MIN_SEC = 5;
export const EDITOR_CLIP_MAX_SEC = 10;
export const EDITOR_CLIP_IDEAL_SEC = 7;

const AD_LABEL_RE =
  /\b(ad|ads|advert|advertisement|promo|promotional|sponsor|sponsored|interstitial|preroll|pre-roll|commercial|end[\s-]?card|title[\s-]?card|cta|call[\s-]?to[\s-]?action|banner[\s-]?ad|overlay[\s-]?ad|full[\s-]?screen[\s-]?ad)\b/i;

const STILL_LABEL_RE =
  /\b(still|static|freeze|frozen|photo|photograph|image|poster|thumbnail|screenshot|slide|slideshow|wallpaper|text[\s-]?screen|loading[\s-]?screen|splash[\s-]?screen|black[\s-]?screen|countdown)\b/i;

const GENERIC_HIGHLIGHT_RE =
  /\b(highlight|best moment|action peak|engaging moment|compelling moment|visual moment)\b/i;

/** Small corner logo/watermark — not a full-screen ad. */
function isLikelyWatermarkRegion(screenW?: number | null, screenH?: number | null): boolean {
  if (screenW == null || screenH == null) return false;
  const area = screenW * screenH;
  return area > 0 && area <= 0.22 && (screenW <= 0.4 || screenH <= 0.4);
}

/** Large on-screen region (often preroll / interstitial ads). */
function isFullScreenRegion(screenW?: number | null, screenH?: number | null): boolean {
  if (screenW == null || screenH == null) return false;
  const area = screenW * screenH;
  return area >= 0.68 || (screenW >= 0.82 && screenH >= 0.82);
}

export type EditorDetectionSegment = {
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
};

export function defaultEditorAnalysisPrompt(targetDurationSec: number): string {
  const clipCountLo = Math.max(1, Math.ceil(targetDurationSec / EDITOR_CLIP_MAX_SEC));
  const clipCountHi = Math.max(clipCountLo, Math.floor(targetDurationSec / EDITOR_CLIP_MIN_SEC));
  return [
    `Build a ${targetDurationSec}-second compiled highlight reel for our site.`,
    `Scan the full source video and pick ${clipCountLo}–${clipCountHi} separate, non-overlapping segments (${EDITOR_CLIP_MIN_SEC}–${EDITOR_CLIP_MAX_SEC}s each) that together fill ~${targetDurationSec}s of runtime.`,
    "Each segment must come from a different time range — never overlap, duplicate, or reuse the same moment.",
    "Only include continuous moving video with clear on-screen action.",
    "Strictly avoid and exclude preroll ads, mid-roll ads, interstitials, sponsor cards, end cards, and full-screen promotional screens; trim around ads when you cannot skip them entirely.",
    "Exclude still images, frozen frames, posters, thumbnails, title cards, and static screens.",
    "Small corner watermarks on the main scene are fine — never treat ads or promo screens as highlights.",
    "Spread picks across the timeline (beginning, middle, end) for variety.",
    "Selected segments will be stitched into one short video with our site logo (brand intro/outro and corner logo on export).",
  ].join(" ");
}

export function buildEditorAnalysisPrompt(
  targetDurationSec: number,
  userDirection?: string | null
): string {
  const system = defaultEditorAnalysisPrompt(targetDurationSec);
  const extra = userDirection?.trim();
  if (!extra) return system;
  return `${system}\n\nCreative direction: ${extra}`;
}

/** True when two segments from the same source video overlap in time. */
export function editorSegmentsOverlap(
  a: { videoId: string; startSec: number; endSec: number },
  b: { videoId: string; startSec: number; endSec: number },
  gapSec = 0.25
): boolean {
  if (a.videoId !== b.videoId) return false;
  return a.startSec < b.endSec - gapSec && a.endSec > b.startSec + gapSec;
}

/** Drop ad-like and still-image detections before packing. */
export function shouldRejectEditorSegment(seg: EditorDetectionSegment): boolean {
  const label = (seg.label || "").trim();
  if (!label) return true;

  if (AD_LABEL_RE.test(label) || STILL_LABEL_RE.test(label)) return true;

  const fullScreen = isFullScreenRegion(seg.screenW, seg.screenH);
  const watermark = isLikelyWatermarkRegion(seg.screenW, seg.screenH);

  // Full-frame bbox near the start is usually a preroll/sponsor card, not main content.
  if (fullScreen && !watermark && seg.startSec < 30) return true;

  // Generic "highlight" labels with a full-screen bbox are often mis-detected ads.
  if (fullScreen && !watermark && GENERIC_HIGHLIGHT_RE.test(label)) return true;

  return false;
}

/** Trim/extend a segment toward the 5–10s editor window. Returns null if unusable. */
export function normalizeEditorClipDuration(
  startSec: number,
  endSec: number,
  sourceDurationSec?: number | null
): { startSec: number; endSec: number } | null {
  let start = startSec;
  let end = endSec;
  let dur = end - start;
  if (dur <= 0.2) return null;

  if (dur > EDITOR_CLIP_MAX_SEC) {
    const mid = (start + end) / 2;
    const take = EDITOR_CLIP_IDEAL_SEC;
    start = mid - take / 2;
    end = start + take;
    dur = take;
  }

  if (dur < EDITOR_CLIP_MIN_SEC) {
    const need = EDITOR_CLIP_MIN_SEC - dur;
    start -= need / 2;
    end = start + EDITOR_CLIP_MIN_SEC;
    dur = EDITOR_CLIP_MIN_SEC;
  }

  if (sourceDurationSec != null && sourceDurationSec > 0) {
    start = Math.max(0, start);
    end = Math.min(sourceDurationSec, end);
    if (end - start < EDITOR_CLIP_MIN_SEC) {
      start = Math.max(0, end - EDITOR_CLIP_MIN_SEC);
    }
    dur = end - start;
  } else {
    start = Math.max(0, start);
  }

  if (dur < EDITOR_CLIP_MIN_SEC || dur > EDITOR_CLIP_MAX_SEC + 0.05) return null;
  return { startSec: start, endSec: end };
}
