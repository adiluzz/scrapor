import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  startSec: z.number().min(0).optional(),
  endSec: z.number().min(0).optional(),
  screenX: z.number().min(0).max(1).nullable().optional(),
  screenY: z.number().min(0).max(1).nullable().optional(),
  screenW: z.number().min(0).max(1).nullable().optional(),
  screenH: z.number().min(0).max(1).nullable().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteCtx) {
  const auth = await guardAdmin(request, "PATCH");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const detection = await prisma.videoAgentDetection.findFirst({
    where: { id, run: { siteId: auth.siteId } },
    include: { run: true },
  });
  if (!detection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  const startSec = d.startSec ?? detection.startSec;
  const endSec = d.endSec ?? detection.endSec;

  if (endSec <= startSec) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }
  if (endSec - startSec < 0.5) {
    return NextResponse.json({ error: "Clip must be at least 0.5 seconds" }, { status: 400 });
  }

  const video = await prisma.video.findFirst({
    where: { id: detection.videoId, siteId: auth.siteId },
    select: { durationSec: true },
  });
  if (video?.durationSec != null && endSec > video.durationSec + 1) {
    return NextResponse.json({ error: "End time exceeds video duration" }, { status: 400 });
  }

  const updated = await prisma.videoAgentDetection.update({
    where: { id },
    data: {
      label: d.label?.trim() ?? undefined,
      startSec: d.startSec ?? undefined,
      endSec: d.endSec ?? undefined,
      screenX: d.screenX === undefined ? undefined : d.screenX,
      screenY: d.screenY === undefined ? undefined : d.screenY,
      screenW: d.screenW === undefined ? undefined : d.screenW,
      screenH: d.screenH === undefined ? undefined : d.screenH,
    },
    include: { feedback: true },
  });

  return NextResponse.json({ detection: updated });
}

export async function DELETE(_request: Request, { params }: RouteCtx) {
  const auth = await guardAdmin(_request, "DELETE");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const detection = await prisma.videoAgentDetection.findFirst({
    where: { id, run: { siteId: auth.siteId } },
    include: { promoClips: { take: 1 } },
  });
  if (!detection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (detection.promoClips.length > 0) {
    return NextResponse.json(
      { error: "Detection is used in a promo ad — remove it from the ad first" },
      { status: 409 }
    );
  }

  await prisma.videoAgentFeedback.deleteMany({ where: { detectionId: id } });
  await prisma.videoAgentDetection.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
