import { NextResponse } from "next/server";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { planPromoAdPrompt } from "@/lib/promo-ad/plan-prompt";
import {
  defaultModelParams,
  parseModelParams,
  stringifyModelParams,
} from "@/lib/promo-ad/params";
import {
  DEFAULT_GENERATIVE_MODEL_ID,
  resolvePromoAdModel,
} from "@/lib/promo-ad-models";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const ads = await prisma.promoAd.findMany({
    where: { siteId: auth.siteId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      iterations: {
        orderBy: { iterationNumber: "desc" },
        take: 1,
        select: {
          id: true,
          iterationNumber: true,
          status: true,
          s3Key: true,
          estimatedCostUsd: true,
          createdAt: true,
        },
      },
      _count: { select: { clips: true, iterations: true } },
    },
  });

  return NextResponse.json({ ads });
}

export async function POST(request: Request) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const userId = authUserId(auth);
  if (!userId) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const detectionIds = Array.isArray(body.detectionIds)
    ? body.detectionIds.filter((id: unknown) => typeof id === "string" && id.trim())
    : [];
  const showcaseVideoId =
    typeof body.showcaseVideoId === "string" ? body.showcaseVideoId.trim() : null;
  const generationMode = body.generationMode === "GENERATIVE" ? "GENERATIVE" : "CLIP_COMPOSE";
  const generativeModelId =
    typeof body.generativeModelId === "string"
      ? body.generativeModelId.trim()
      : generationMode === "GENERATIVE"
        ? DEFAULT_GENERATIVE_MODEL_ID
        : null;
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (detectionIds.length === 0) {
    return NextResponse.json({ error: "Select at least one approved clip" }, { status: 400 });
  }

  if (generationMode === "GENERATIVE") {
    const model = generativeModelId ? resolvePromoAdModel(generativeModelId) : null;
    if (!model || model.generationMode !== "generative") {
      return NextResponse.json({ error: "Invalid or unavailable generative model" }, { status: 400 });
    }
  }

  try {
    const detections = await prisma.videoAgentDetection.findMany({
      where: {
        id: { in: detectionIds },
        feedback: { approved: true },
        run: { siteId: auth.siteId },
      },
      select: {
        id: true,
        label: true,
        videoId: true,
        videoTitle: true,
      },
    });

    if (detections.length === 0) {
      return NextResponse.json({ error: "No valid approved clips found" }, { status: 400 });
    }

    const showcase =
      showcaseVideoId &&
      (await prisma.video.findFirst({
        where: { id: showcaseVideoId, siteId: auth.siteId, isDeleted: false },
        select: { id: true, title: true },
      }));

    let prompt: string | null = null;
    let modelParams = defaultModelParams(generationMode);

    if (generationMode === "GENERATIVE") {
      const plan = await planPromoAdPrompt({
        clipLabels: detections.map((d) => `${d.label} (${d.videoTitle})`),
        showcaseVideoTitle: showcase?.title,
      });
      prompt = plan.prompt;
      modelParams = defaultModelParams(generationMode, {
        durationSeconds: plan.durationSeconds,
      });
    }

    const ad = await prisma.promoAd.create({
      data: {
        siteId: auth.siteId,
        title: title || `Promo ad ${new Date().toISOString().slice(0, 10)}`,
        status: "DRAFT",
        generationMode,
        generativeModelId: generationMode === "GENERATIVE" ? generativeModelId : null,
        showcaseVideoId: showcase?.id ?? detections[0]?.videoId ?? null,
        prompt,
        modelParams: stringifyModelParams(modelParams),
        createdByUserId: userId,
        clips: {
          create: detections.map((d, i) => ({
            detectionId: d.id,
            sortOrder: i,
          })),
        },
      },
      include: {
        clips: {
          orderBy: { sortOrder: "asc" },
          include: {
            detection: {
              select: {
                id: true,
                videoId: true,
                videoTitle: true,
                label: true,
                startSec: true,
                endSec: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ ad });
  } catch (err) {
    logger.error({ err }, "promo-ad create failed");
    const message = err instanceof Error ? err.message : "Failed to create ad";
    const hint = message.includes("PromoAd")
      ? " Database migrations may be pending — run: docker compose run --rm migrate"
      : "";
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
}
