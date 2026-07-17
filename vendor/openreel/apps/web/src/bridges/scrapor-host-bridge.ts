/**
 * Host bridge: when OpenReel runs inside the scrapor admin iframe,
 * the parent posts IMPORT_MEDIA messages with same-origin stream URLs.
 */
import { useProjectStore } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";

const PARENT_ORIGIN = "*";

type ImportItem = {
  id: string;
  title: string;
  url: string;
  kind?: "video" | "image";
  startSec?: number;
  endSec?: number;
};

function postToParent(type: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage({ source: "openreel-scrapor", type, ...payload }, PARENT_ORIGIN);
}

async function fetchAsFile(url: string, filename: string, mime: string): Promise<File> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: mime || blob.type || "application/octet-stream" });
}

async function importMediaItems(items: ImportItem[]) {
  const store = useProjectStore.getState();

  if (!store.project) {
    store.createNewProject("Scrapor edit", { width: 1920, height: 1080, frameRate: 30 });
    useUIStore.getState().setSkipWelcomeScreen(true);
  }

  let timelineCursor = 0;

  for (const item of items) {
    try {
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
        const clip = clips.find((c) => c.mediaId === media.id && c.startTime === startAt) ||
          clips.filter((c) => c.mediaId === media.id).at(-1);

        let clipDur = media.metadata.duration || 5;
        if (
          clip &&
          item.startSec != null &&
          item.endSec != null &&
          item.endSec > item.startSec
        ) {
          await useProjectStore.getState().trimClip(clip.id, item.startSec, item.endSec);
          clipDur = Math.max(0.1, item.endSec - item.startSec);
        }
        timelineCursor += clipDur;
      }

      postToParent("IMPORT_OK", { id: item.id, mediaId: media.id });
    } catch (e) {
      postToParent("IMPORT_ERROR", {
        id: item.id,
        error: e instanceof Error ? e.message : "Import failed",
      });
    }
  }
  postToParent("IMPORT_DONE", { count: items.length });
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
