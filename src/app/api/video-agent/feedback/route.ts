import { NextResponse } from "next/server";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { recordFeedbackTraining } from "@/lib/video-agent-feedback";
import { isPissSwallowVerificationLabel } from "@/lib/verified-tags";
import { isSessionAuth } from "@/lib/api-access";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const detectionId = typeof body.detectionId === "string" ? body.detectionId : "";
  const approved = body.approved === true;

  if (!detectionId) {
    return NextResponse.json({ error: "detectionId is required" }, { status: 400 });
  }

  const userId = authUserId(auth);
  if (!userId) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  const detection = await prisma.videoAgentDetection.findFirst({
    where: {
      id: detectionId,
      ...(isSessionAuth(auth) && auth.role === "ADMIN"
        ? {}
        : { run: { siteId: auth.siteId } }),
    },
    include: { run: { select: { siteId: true } } },
  });
  if (!detection) {
    return NextResponse.json({ error: "Detection not found" }, { status: 404 });
  }

  const siteId = detection.run.siteId;
  await recordFeedbackTraining(detectionId, approved, userId, siteId);

  if (approved && isPissSwallowVerificationLabel(detection.label)) {
    const { linkPissSwallowVerifiedTag } = await import("@/lib/videos");
    await linkPissSwallowVerifiedTag(siteId, detection.videoId);
  }

  return NextResponse.json({ ok: true, approved });
}
