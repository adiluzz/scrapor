/**
 * Test endpoint: navigates to example.com and saves a screenshot.
 * GET /api/test-screenshot?filename=e2e-test-photo
 * Use to verify saveScreenshot works without going through Ollama.
 */
import { NextRequest } from "next/server";
import { browserNavigate, browserSaveScreenshot } from "@/lib/browser-agent";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  const filename = req.nextUrl.searchParams.get("filename") || "test-screenshot";
  try {
    await browserNavigate("https://example.com");
    const result = await browserSaveScreenshot(filename);
    return Response.json({ ok: true, message: result });
  } catch (e) {
    console.error("[test-screenshot]", e);
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
