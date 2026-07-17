/** Server-extracted MP4 clip for preview (same-origin, cookie auth). */
export function editorClipUrl(videoId: string, startSec: number, endSec: number): string {
  const qs = new URLSearchParams({
    startSec: String(startSec),
    endSec: String(endSec),
  });
  return `/api/admin/videos/${videoId}/editor-clip?${qs}`;
}
