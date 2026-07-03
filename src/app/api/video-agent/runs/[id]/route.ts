import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const run = await prisma.videoAgentRun.findFirst({
    where: { id, siteId: auth.siteId },
    include: {
      detections: {
        include: { feedback: true },
        orderBy: [{ videoId: "asc" }, { startSec: "asc" }],
      },
      agent: { select: { name: true, key: true } },
    },
  });

  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ run });
}
