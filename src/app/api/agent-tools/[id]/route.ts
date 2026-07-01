import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT() {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  return new Response(
    JSON.stringify({
      error: "Tool descriptions are code-owned. Edit the matching file in src/lib/assistant-tools/tools instead.",
    }),
    { status: 405, headers: { "Content-Type": "application/json" } }
  );
}
