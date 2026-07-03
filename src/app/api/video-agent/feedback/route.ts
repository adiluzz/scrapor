import { NextResponse } from "next/server";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { recordFeedbackTraining } from "@/lib/video-agent-feedback";
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
    where: { id: detectionId, run: { siteId: auth.siteId } },
  });
  if (!detection) {
    return NextResponse.json({ error: "Detection not found" }, { status: 404 });
  }

  await recordFeedbackTraining(detectionId, approved, userId, auth.siteId);

  return NextResponse.json({ ok: true, approved });
}
