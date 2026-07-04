import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { estimatePromoAdCost } from "@/lib/promo-ad-models";

export async function POST(request: Request) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "GENERATIVE" ? "GENERATIVE" : "CLIP_COMPOSE";
  const modelId = typeof body.modelId === "string" ? body.modelId.trim() : undefined;
  const durationSeconds =
    typeof body.durationSeconds === "number" ? body.durationSeconds : 12;
  const audioEnabled = body.audioEnabled === true;
  const includePlanner = body.includePlanner !== false;
  const clipCount = typeof body.clipCount === "number" ? body.clipCount : undefined;

  try {
    const estimate = estimatePromoAdCost({
      mode,
      modelId,
      durationSeconds,
      audioEnabled,
      includePlanner,
      clipCount,
    });
    return NextResponse.json({ estimate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Estimate failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
