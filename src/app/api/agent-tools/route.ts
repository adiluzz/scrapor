import { listAssistantTools } from "@/lib/assistant-tools/registry";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request) {
    const g = await guardAdmin();
    if (g instanceof NextResponse) return g;
    try {
    return Response.json({ tools: listAssistantTools() });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to load tools" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
