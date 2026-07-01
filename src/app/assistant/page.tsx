"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function makeChatId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AssistantIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/assistant/${makeChatId()}`);
  }, [router]);
  return null;
}
