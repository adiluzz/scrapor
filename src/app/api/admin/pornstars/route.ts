import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { pornstarImageUrl } from "@/lib/pornstar-image";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

  const stars = await prisma.pornstar.findMany({
    where: {
      siteId: auth.siteId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ videos: { _count: "desc" } }, { name: "asc" }],
    include: { _count: { select: { videos: true } } },
    take: limit,
  });

  return NextResponse.json({
    pornstars: stars.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      bio: s.bio,
      videoCount: s._count.videos,
      hasImage: Boolean(s.s3Image),
      imageUrl: pornstarImageUrl(s),
    })),
  });
}
