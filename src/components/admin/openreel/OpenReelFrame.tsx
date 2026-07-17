"use client";

import { useEffect, useRef, useState } from "react";

export type OpenReelImportItem = {
  id: string;
  title: string;
  url: string;
  kind?: "video" | "image";
  /** Library video id (for server FFmpeg compose). */
  sourceVideoId?: string;
  /** Original source in/out (for server render). */
  startSec?: number;
  endSec?: number;
  /** Clip URL is already trimmed server-side — OpenReel must not re-trim. */
  pretrimmed?: boolean;
};

/**
 * Embeds the vendored OpenReel SPA and bridges library media via postMessage.
 */
export default function OpenReelFrame({
  items,
  logoUrl,
  className,
}: {
  items: OpenReelImportItem[];
  logoUrl?: string | null;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading OpenReel…");
  const importedKey = useRef("");

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || data.source !== "openreel-scrapor") return;
      if (data.type === "READY" || data.type === "PONG") {
        setReady(true);
        setStatus("OpenReel ready");
      }
      if (data.type === "IMPORT_PROGRESS") {
        setStatus(`Importing ${data.id} (${data.phase}${data.bytes ? `, ${Math.round(Number(data.bytes) / 1024 / 1024)}MB` : ""})…`);
      }
      if (data.type === "IMPORT_OK") {
        setStatus(`Imported ${data.id}`);
      }
      if (data.type === "IMPORT_DONE") {
        setStatus(
          `Imported ${data.count}/${data.requested ?? data.count} item(s). Edit, then export from OpenReel.`
        );
      }
      if (data.type === "IMPORT_ERROR") {
        setStatus(`Import error (${data.id}): ${data.error}`);
      }
      if (data.type === "EXPORT_HINT") {
        setStatus(String(data.message || "Export from OpenReel toolbar"));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready || !iframeRef.current?.contentWindow) return;
    if (items.length === 0) {
      importedKey.current = "";
      return;
    }
    const key = JSON.stringify(
      items.map((i) => [i.id, i.url, i.startSec ?? "", i.endSec ?? "", i.pretrimmed ? 1 : 0])
    );
    if (key === importedKey.current) return;
    importedKey.current = key;

    const payload: OpenReelImportItem[] = [...items];
    if (logoUrl) {
      payload.push({
        id: "site-logo",
        title: "Site logo",
        url: logoUrl,
        kind: "image",
      });
    }

    setStatus(`Importing ${items.length} item(s)…`);
    iframeRef.current.contentWindow.postMessage(
      { target: "openreel-scrapor", type: "IMPORT_MEDIA", items: payload },
      "*"
    );
  }, [ready, items, logoUrl]);

  return (
    <div className={className}>
      <p className="mb-2 text-xs text-zinc-500">{status}</p>
      <iframe
        ref={iframeRef}
        title="OpenReel video editor"
        src="/openreel/index.html#/new?preset=youtube-video"
        className="h-[min(78vh,900px)] w-full rounded-xl border border-zinc-800 bg-black"
        allow="cross-origin-isolated; autoplay; clipboard-write"
        onLoad={() => {
          iframeRef.current?.contentWindow?.postMessage(
            { target: "openreel-scrapor", type: "PING" },
            "*"
          );
        }}
      />
    </div>
  );
}

/** Build a same-origin URL for a server-extracted editor clip. */
export function editorClipUrl(videoId: string, startSec: number, endSec: number): string {
  const qs = new URLSearchParams({
    startSec: String(startSec),
    endSec: String(endSec),
  });
  return `/api/admin/videos/${videoId}/editor-clip?${qs}`;
}
