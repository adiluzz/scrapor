import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { presignGet } from "@/lib/storage";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteCtx) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const url = new URL(request.url);
  const iterationNumber = parseInt(url.searchParams.get("iteration") || "0", 10);

  const ad = await prisma.promoAd.findFirst({
    where: { id, siteId: auth.siteId },
    include: {
      iterations: {
        where: iterationNumber > 0 ? { iterationNumber } : undefined,
        orderBy: { iterationNumber: "desc" },
        take: 1,
      },
    },
  });

  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const iteration = ad.iterations[0];
  if (!iteration?.s3Key) {
    return NextResponse.json({ error: "No rendered video yet" }, { status: 404 });
  }

  try {
    const streamUrl = await presignGet(iteration.s3Key, 3600);
    return NextResponse.json({
      url: streamUrl,
      iterationNumber: iteration.iterationNumber,
      status: iteration.status,
    });
  } catch {
    return NextResponse.json({ error: "Failed to sign playback URL" }, { status: 500 });
  }
}
