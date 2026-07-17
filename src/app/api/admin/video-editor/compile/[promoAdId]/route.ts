import { NextResponse } from "next/server";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { syncPromoAdCompileStatus } from "@/lib/ad-clips-compile";

/** Poll FFmpeg compose; publish compiled video to Ad clips when ready. */
export async function GET(_request: Request, { params }: { params: Promise<{ promoAdId: string }> }) {
  const auth = await guardAdmin(_request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { promoAdId } = await params;

  const result = await syncPromoAdCompileStatus(promoAdId, authUserId(auth));
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(result);
}
