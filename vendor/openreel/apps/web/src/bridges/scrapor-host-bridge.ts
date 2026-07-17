/**
 * Host bridge: when OpenReel runs inside the scrapor admin iframe,
 * the parent posts IMPORT_MEDIA messages with same-origin stream / clip URLs.
 *
 * Large tube files must NOT be fetched as full blobs — the parent should send
 * pre-extracted editor-clip URLs (or short proxies). This bridge also enforces
 * a hard download size limit as a last line of defense.
 */
import { useProjectStore } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";

const PARENT_ORIGIN = "*";
/** Keep in sync with src/lib/video-editor-limits.ts MAX_BROWSER_IMPORT_BYTES */
const MAX_IMPORT_BYTES = 120 * 1024 * 1024;

type ImportItem = {
  id: string;
  title: string;
  url: string;
  kind?: "video" | "image";
  startSec?: number;
  endSec?: number;
  /** Clip file is already trimmed server-side — do not apply start/end again. */
  pretrimmed?: boolean;
};

function postToParent(type: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage({ source: "openreel-scrapor", type, ...payload }, PARENT_ORIGIN);
}

async function fetchAsFile(url: string, filename: string, mime: string): Promise<File> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);

  const lenHeader = res.headers.get("content-length");
  const declared = lenHeader ? parseInt(lenHeader, 10) : NaN;
  if (Number.isFinite(declared) && declared > MAX_IMPORT_BYTES) {
    throw new Error(
      `File too large for browser editor (${Math.round(declared / 1024 / 1024)}MB). Use AI highlight or a server-extracted clip.`
    );
  }

  if (!res.body) {
    const blob = await res.blob();
    if (blob.size > MAX_IMPORT_BYTES) {
      throw new Error(`File too large for browser editor (${Math.round(blob.size / 1024 / 1024)}MB).`);
    }
    return new File([blob], filename, { type: mime || blob.type || "application/octet-stream" });
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_IMPORT_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error(
        `Download exceeded ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)}MB browser limit. Use AI highlight or Load proxy.`
      );
    }
    chunks.push(value);
  }

  const blob = new Blob(chunks as BlobPart[], {
    type: mime || res.headers.get("content-type") || "application/octet-stream",
  });
  return new File([blob], filename, { type: blob.type });
}

async function importMediaItems(items: ImportItem[]) {
  const store = useProjectStore.getState();

  if (!store.project) {
    store.createNewProject("Scrapor edit", { width: 1920, height: 1080, frameRate: 30 });
    useUIStore.getState().setSkipWelcomeScreen(true);
  }

  let timelineCursor = 0;
  let okCount = 0;

  for (const item of items) {
    try {
      postToParent("IMPORT_PROGRESS", { id: item.id, phase: "download" });
      const isImage = item.kind === "image";
      const safeName = (item.title || item.id).replace(/[^\w.-]+/g, "_");
      const file = await fetchAsFile(
        item.url,
        isImage ? `${safeName}.png` : `${safeName}.mp4`,
        isImage ? "image/png" : "video/mp4"
      );

      const beforeIds = new Set(
        (useProjectStore.getState().project?.mediaLibrary.items || []).map((m) => m.id)
      );

      postToParent("IMPORT_PROGRESS", { id: item.id, phase: "import", bytes: file.size });
      const importResult = await useProjectStore.getState().importMedia(file);
      if (!importResult.success) {
        postToParent("IMPORT_ERROR", {
          id: item.id,
          error: importResult.error?.message || "Import failed",
        });
        continue;
      }

      const after = useProjectStore.getState().project?.mediaLibrary.items || [];
      const media = after.find((m) => !beforeIds.has(m.id)) || after[after.length - 1];
      if (!media) {
        postToParent("IMPORT_ERROR", { id: item.id, error: "Media not found after import" });
        continue;
      }

      if (!isImage) {
        const startAt = timelineCursor;
        await useProjectStore.getState().addClipToNewTrack(media.id, startAt);

        const clips =
          useProjectStore.getState().project?.timeline.tracks.flatMap((t) => t.clips) || [];
        const clip =
          clips.find((c) => c.mediaId === media.id && c.startTime === startAt) ||
          clips.filter((c) => c.mediaId === media.id).at(-1);

        let clipDur = media.metadata.duration || 5;
        const shouldTrim =
          !item.pretrimmed &&
          clip &&
          item.startSec != null &&
          item.endSec != null &&
          item.endSec > item.startSec;

        if (shouldTrim && clip) {
          await useProjectStore.getState().trimClip(clip.id, item.startSec!, item.endSec!);
          clipDur = Math.max(0.1, item.endSec! - item.startSec!);
        }
        timelineCursor += clipDur;
      }

      okCount += 1;
      postToParent("IMPORT_OK", { id: item.id, mediaId: media.id, bytes: file.size });
    } catch (e) {
      postToParent("IMPORT_ERROR", {
        id: item.id,
        error: e instanceof Error ? e.message : "Import failed",
      });
    }
  }
  postToParent("IMPORT_DONE", { count: okCount, requested: items.length });
}

export function installScraporHostBridge() {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __scraporBridge?: boolean }).__scraporBridge) return;
  (window as unknown as { __scraporBridge?: boolean }).__scraporBridge = true;

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.target !== "openreel-scrapor") return;

    if (data.type === "IMPORT_MEDIA" && Array.isArray(data.items)) {
      void importMediaItems(data.items as ImportItem[]);
    }
    if (data.type === "PING") {
      postToParent("PONG", { ready: true });
    }
    if (data.type === "REQUEST_EXPORT") {
      postToParent("EXPORT_HINT", {
        message:
          "Export from OpenReel’s toolbar, then upload the MP4 with Save to library — or use Auto-render in the parent panel.",
      });
    }
  });

  postToParent("READY", {});
}
