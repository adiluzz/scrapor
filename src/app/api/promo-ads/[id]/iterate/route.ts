import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { planPromoAdPrompt } from "@/lib/promo-ad/plan-prompt";
import { enqueuePromoAdIteration } from "@/lib/promo-ad-queue";
import { parseModelParams, stringifyModelParams } from "@/lib/promo-ad/params";
import { estimatePromoAdCost } from "@/lib/promo-ad-models";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteCtx) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
  const clientEstimate =
    typeof body.estimatedCostUsd === "number" ? body.estimatedCostUsd : null;

  if (!feedback) {
    return NextResponse.json({ error: "Feedback is required" }, { status: 400 });
  }

  const ad = await prisma.promoAd.findFirst({
    where: { id, siteId: auth.siteId },
    include: {
      clips: {
        orderBy: { sortOrder: "asc" },
        include: { detection: { select: { label: true, videoTitle: true } } },
      },
      iterations: { orderBy: { iterationNumber: "desc" }, take: 1 },
    },
  });

  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ad.generationMode !== "GENERATIVE") {
    return NextResponse.json(
      { error: "Iterations with feedback are only supported for generative ads" },
      { status: 400 }
    );
  }
  if (ad.status === "GENERATING") {
    return NextResponse.json({ error: "Already generating" }, { status: 409 });
  }

  const parent = ad.iterations[0];
  const params_ = parseModelParams(ad.modelParams);
  const durationSeconds = params_.durationSeconds ?? 12;

  let serverEstimate;
  try {
    serverEstimate = estimatePromoAdCost({
      mode: "GENERATIVE",
      modelId: ad.generativeModelId ?? undefined,
      durationSeconds,
      audioEnabled: params_.audioEnabled,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Estimate failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (clientEstimate != null) {
    const drift = Math.abs(clientEstimate - serverEstimate.totalUsd);
    if (drift > Math.max(0.05, serverEstimate.totalUsd * 0.05)) {
      return NextResponse.json(
        { error: "Cost estimate changed", estimate: serverEstimate },
        { status: 409 }
      );
    }
  }

  try {
    const plan = await planPromoAdPrompt({
      clipLabels: ad.clips.map((c) => `${c.detection.label} (${c.detection.videoTitle})`),
      priorPrompt: ad.prompt ?? parent?.userPrompt ?? undefined,
      userFeedback: feedback,
    });

    const nextNumber = (parent?.iterationNumber ?? 0) + 1;
    const modelParams = stringifyModelParams({
      ...params_,
      durationSeconds: plan.durationSeconds,
    });

    await prisma.promoAd.update({
      where: { id: ad.id },
      data: {
        prompt: plan.prompt,
        modelParams,
        status: "GENERATING",
      },
    });

    const iteration = await prisma.promoAdIteration.create({
      data: {
        promoAdId: ad.id,
        iterationNumber: nextNumber,
        userPrompt: plan.prompt,
        modelParams,
        status: "PENDING",
        parentIterationId: parent?.id ?? null,
        userFeedback: feedback,
        estimatedCostUsd: serverEstimate.totalUsd,
      },
    });

    await enqueuePromoAdIteration(iteration.id);

    return NextResponse.json({ iteration, plan, estimate: serverEstimate });
  } catch (err) {
    logger.error({ err, adId: ad.id }, "promo-ad iterate failed");
    const message = err instanceof Error ? err.message : "Failed to start revision";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
