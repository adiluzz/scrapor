/** Timeline clip — references library video with in/out points (seconds). */
export type EditorClip = {
  id: string;
  videoId: string;
  title: string;
  startSec: number;
  endSec: number;
};

export type LibraryVideo = {
  id: string;
  title: string;
  slug: string;
  durationSec: number | null;
  status: string;
};

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
  }));
}

export function newClipId(videoId: string): string {
  return `${videoId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
