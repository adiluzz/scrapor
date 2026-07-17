"use client";

import { useEffect, useRef, useState } from "react";

export type OpenReelImportItem = {
  id: string;
  title: string;
  url: string;
  kind?: "video" | "image";
  /** Library video id (for server FFmpeg compose). */
  sourceVideoId?: string;
  startSec?: number;
  endSec?: number;
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
        setStatus("OpenReel ready — importing library media…");
      }
      if (data.type === "IMPORT_OK") {
        setStatus(`Imported ${data.id}`);
      }
      if (data.type === "IMPORT_DONE") {
        setStatus(`Imported ${data.count} item(s). Edit, then export from OpenReel.`);
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
    const key = JSON.stringify(items.map((i) => i.id + (i.startSec ?? "") + (i.endSec ?? "")));
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
