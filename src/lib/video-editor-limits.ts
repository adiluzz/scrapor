/** Browser cannot safely hold full tube files in memory. */

/** Max bytes for a single browser download (legacy guard). */
export const MAX_BROWSER_IMPORT_BYTES = 120 * 1024 * 1024; // 120 MB

/** Max source duration for a full-file browser import (no server extract). */
export const MAX_FULL_IMPORT_DURATION_SEC = 180; // 3 minutes

/** Max length of a server-extracted editor clip. */
export const MAX_EDITOR_CLIP_DURATION_SEC = 180;

/** Default clip window when adding a long video to the timeline. */
export const DEFAULT_PROXY_DURATION_SEC = 30;
