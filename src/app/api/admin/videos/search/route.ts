import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  if (q.length < 2) {
    return NextResponse.json({ videos: [] });
  }

  const videos = await prisma.video.findMany({
    where: {
      siteId: auth.siteId,
      title: { contains: q, mode: "insensitive" },
    },
    orderBy: { viewCount: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      slug: true,
      durationSec: true,
      status: true,
      isDeleted: true,
    },
  });

  return NextResponse.json({ videos });
}
