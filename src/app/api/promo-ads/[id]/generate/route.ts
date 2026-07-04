import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { enqueuePromoAdIteration } from "@/lib/promo-ad-queue";
import { parseModelParams, stringifyModelParams } from "@/lib/promo-ad/params";
import { estimatePromoAdCost } from "@/lib/promo-ad-models";

type RouteCtx = { params: Promise<{ id: string }> };

function clipDurationSum(
  clips: { detection: { startSec: number; endSec: number } }[]
): number {
  return clips.reduce((sum, c) => sum + Math.max(0, c.detection.endSec - c.detection.startSec), 0);
}

export async function POST(request: Request, { params }: RouteCtx) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const clientEstimate =
    typeof body.estimatedCostUsd === "number" ? body.estimatedCostUsd : null;

  const ad = await prisma.promoAd.findFirst({
    where: { id, siteId: auth.siteId },
    include: {
      clips: {
        orderBy: { sortOrder: "asc" },
        include: { detection: true },
      },
      iterations: { orderBy: { iterationNumber: "desc" }, take: 1 },
    },
  });

  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ad.status === "GENERATING") {
    return NextResponse.json({ error: "Already generating" }, { status: 409 });
  }
  if (ad.clips.length === 0) {
    return NextResponse.json({ error: "Add at least one clip" }, { status: 400 });
  }

  const params_ = parseModelParams(ad.modelParams);
  const bodyDuration = clipDurationSum(ad.clips);
  const durationSeconds =
    ad.generationMode === "CLIP_COMPOSE"
      ? Math.min(params_.maxBodySeconds ?? 60, Math.ceil(bodyDuration))
      : (params_.durationSeconds ?? 12);

  let serverEstimate;
  try {
    serverEstimate = estimatePromoAdCost({
      mode: ad.generationMode,
      modelId: ad.generativeModelId ?? undefined,
      durationSeconds,
      audioEnabled: params_.audioEnabled,
      clipCount: ad.clips.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Estimate failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (clientEstimate != null) {
    const drift = Math.abs(clientEstimate - serverEstimate.totalUsd);
    if (drift > Math.max(0.05, serverEstimate.totalUsd * 0.05)) {
      return NextResponse.json(
        {
          error: "Cost estimate changed — refresh and confirm again",
          estimate: serverEstimate,
        },
        { status: 409 }
      );
    }
  }

  if (ad.generationMode === "GENERATIVE" && !ad.prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required for AI generation" }, { status: 400 });
  }

  const nextNumber = (ad.iterations[0]?.iterationNumber ?? 0) + 1;

  try {
    const iteration = await prisma.promoAdIteration.create({
      data: {
        promoAdId: ad.id,
        iterationNumber: nextNumber,
        userPrompt: ad.prompt,
        modelParams: ad.modelParams ?? stringifyModelParams(params_),
        status: "PENDING",
        estimatedCostUsd: serverEstimate.totalUsd,
      },
    });

    await prisma.promoAd.update({
      where: { id: ad.id },
      data: { status: "GENERATING" },
    });

    await enqueuePromoAdIteration(iteration.id);

    return NextResponse.json({
      iteration,
      estimate: serverEstimate,
    });
  } catch (err) {
    logger.error({ err, adId: ad.id }, "promo-ad generate enqueue failed");
    return NextResponse.json({ error: "Failed to start generation" }, { status: 500 });
  }
}
