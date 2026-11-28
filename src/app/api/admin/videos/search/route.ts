import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const siteId = (url.searchParams.get("siteId") || "").trim() || undefined;
  const pornstarId = (url.searchParams.get("pornstarId") || "").trim() || undefined;
  const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

  if (q.length < 2) {
    return NextResponse.json({ videos: [] });
  }

  const videos = await prisma.video.findMany({
    where: {
      isDeleted: false,
      AND: [
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        },
        ...(siteId ? [{ OR: [{ siteId }, { sites: { some: { siteId } } }] }] : []),
      ],
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
      ...(pornstarId
        ? { pornstars: { where: { pornstarId }, select: { pornstarId: true } } }
        : {}),
    },
  });

  return NextResponse.json({
    videos: videos.map((video) => {
      const { pornstars, ...rest } = video as typeof video & {
        pornstars?: { pornstarId: string }[];
      };
      return {
        ...rest,
        ...(pornstarId ? { alreadyLinked: (pornstars?.length ?? 0) > 0 } : {}),
      };
    }),
  });
}
