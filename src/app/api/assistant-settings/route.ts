import { loadAssistantSettings, saveAssistantSettings } from "@/lib/assistant-settings";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  const settings = await loadAssistantSettings();
  return Response.json({ settings });
}

export async function POST(req: Request) {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  try {
    const body = ((await req.json()) || {}) as Record<string, unknown>;
    const settings = await saveAssistantSettings(body as Parameters<typeof saveAssistantSettings>[0]);
    return Response.json({ ok: true, settings });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to save settings" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
