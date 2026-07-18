"use client";

import { Suspense } from "react";
import AdClipsPageContent from "./AdClipsPageContent";

export default function AdClipsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading clips…</p>}>
      <AdClipsPageContent />
    </Suspense>
  );
}
