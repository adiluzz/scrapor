/** Browser OpenReel cannot safely hold full tube files in memory. */

/** Max bytes the OpenReel iframe may download as a single File/blob. */
export const MAX_BROWSER_IMPORT_BYTES = 120 * 1024 * 1024; // 120 MB

/** Max source duration for a full-file browser import (no server extract). */
export const MAX_FULL_IMPORT_DURATION_SEC = 180; // 3 minutes

/** Max length of a server-extracted editor clip. */
export const MAX_EDITOR_CLIP_DURATION_SEC = 180;

/** Default proxy window when loading a long video into OpenReel. */
export const DEFAULT_PROXY_DURATION_SEC = 30;
