"use client";

import { useEffect, useState } from "react";
import LibraryMediaProvider from "@/components/admin/video-editor/LibraryMediaProvider";
import ScraporVideoEditor from "@/components/admin/video-editor/ScraporVideoEditor";

export default function AdminVideoEditorPage() {
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Video editor · Admin";
  }, []);

  return (
    <LibraryMediaProvider>
      {(ctx) => (
        <ScraporVideoEditor
          siteId={ctx.siteId}
          sites={ctx.sites}
          onSiteChange={ctx.setSiteId}
          library={ctx.library}
          clips={ctx.clips}
          onClipsChange={ctx.setClips}
          jobId={jobId}
          onJobId={setJobId}
          videoIds={ctx.videoIds}
        />
      )}
    </LibraryMediaProvider>
  );
}
