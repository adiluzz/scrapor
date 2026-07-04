import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { pornstarImageUrl } from "@/lib/pornstar-image";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const star = await prisma.pornstar.findFirst({
    where: { id, siteId: auth.siteId },
    include: { _count: { select: { videos: true } } },
  });
  if (!star) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    pornstar: {
      id: star.id,
      name: star.name,
      slug: star.slug,
      bio: star.bio,
      videoCount: star._count.videos,
      hasImage: Boolean(star.s3Image),
      imageUrl: pornstarImageUrl(star),
    },
  });
}
