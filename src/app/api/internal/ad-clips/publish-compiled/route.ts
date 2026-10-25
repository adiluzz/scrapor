import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  publishUnpublishedEditorCompiles,
  syncPromoAdCompileStatus,
} from "@/lib/ad-clips-compile";
import { logger } from "@/lib/logger";

function tokenMatches(request: Request): boolean {
  const secret = process.env.API_KEY_SECRET || "";
  if (secret.length < 16) return false;
  const got = request.headers.get("x-internal-token") || "";
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(got).digest();
  return timingSafeEqual(a, b);
}

/**
 * Called by the ad-generator when a compile finishes, and on a timer for any
 * editor compile that finished while this app was down. The browser poll is
 * only a progress indicator.
 */
export async function POST(request: Request) {
  if (!tokenMatches(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let promoAdId = "";
  try {
    const body = (await request.json()) as { promoAdId?: unknown };
    if (typeof body.promoAdId === "string") promoAdId = body.promoAdId.trim();
  } catch {
    promoAdId = "";
  }

  try {
    if (promoAdId) {
      const result = await syncPromoAdCompileStatus(promoAdId);
      if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, result });
    }

    const published = await publishUnpublishedEditorCompiles();
    return NextResponse.json({ ok: true, count: published.length, published });
  } catch (err) {
    logger.error({ err, promoAdId }, "internal compiled publish failed");
    return NextResponse.json({ error: "Publish failed" }, { status: 500 });
  }
}
