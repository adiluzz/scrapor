import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { parseModelParams, stringifyModelParams } from "@/lib/promo-ad/params";
import { resolvePromoAdModel } from "@/lib/promo-ad-models";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteCtx) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const ad = await prisma.promoAd.findFirst({
    where: { id, siteId: auth.siteId },
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
              screenX: true,
              screenY: true,
              screenW: true,
              screenH: true,
              confidence: true,
            },
          },
        },
      },
      iterations: { orderBy: { iterationNumber: "asc" } },
    },
  });

  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ad: {
      ...ad,
      modelParams: parseModelParams(ad.modelParams),
      iterations: ad.iterations.map((it) => ({
        ...it,
        modelParams: parseModelParams(it.modelParams),
      })),
    },
  });
}

export async function PATCH(request: Request, { params }: RouteCtx) {
  const auth = await guardAdmin(request, "PATCH");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const ad = await prisma.promoAd.findFirst({
    where: { id, siteId: auth.siteId },
  });
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ad.status === "GENERATING") {
    return NextResponse.json({ error: "Ad is generating — wait for completion" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.prompt === "string") data.prompt = body.prompt.trim();
  if (typeof body.showcaseVideoId === "string") data.showcaseVideoId = body.showcaseVideoId.trim();

  if (body.generationMode === "CLIP_COMPOSE" || body.generationMode === "GENERATIVE") {
    data.generationMode = body.generationMode;
    if (body.generationMode === "CLIP_COMPOSE") {
      data.generativeModelId = null;
    }
  }

  if (typeof body.generativeModelId === "string") {
    const model = resolvePromoAdModel(body.generativeModelId.trim());
    if (!model || model.generationMode !== "generative") {
      return NextResponse.json({ error: "Invalid generative model" }, { status: 400 });
    }
    data.generativeModelId = model.id;
    data.generationMode = "GENERATIVE";
  }

  if (body.modelParams && typeof body.modelParams === "object") {
    const current = parseModelParams(ad.modelParams);
    data.modelParams = stringifyModelParams({ ...current, ...body.modelParams });
  }

  if (Array.isArray(body.detectionIds)) {
    const detectionIds = body.detectionIds.filter(
      (d: unknown) => typeof d === "string" && d.trim()
    ) as string[];
    const detections = await prisma.videoAgentDetection.findMany({
      where: {
        id: { in: detectionIds },
        feedback: { approved: true },
        run: { siteId: auth.siteId },
      },
      select: { id: true },
    });
    if (detections.length === 0) {
      return NextResponse.json({ error: "No valid clips" }, { status: 400 });
    }
    await prisma.promoAdClip.deleteMany({ where: { promoAdId: id } });
    await prisma.promoAdClip.createMany({
      data: detections.map((d, i) => ({
        promoAdId: id,
        detectionId: d.id,
        sortOrder: i,
      })),
    });
  }

  const updated = await prisma.promoAd.update({
    where: { id },
    data,
    include: {
      clips: {
        orderBy: { sortOrder: "asc" },
        include: { detection: true },
      },
      iterations: { orderBy: { iterationNumber: "asc" } },
    },
  });

  return NextResponse.json({
    ad: {
      ...updated,
      modelParams: parseModelParams(updated.modelParams),
    },
  });
}
