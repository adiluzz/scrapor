import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

const putSchema = z.object({
  siteIds: z.array(z.string().min(1)).max(50),
});

/** Replace VideoSite publication membership for a video (platform-wide). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const video = await prisma.video.findUnique({ where: { id }, select: { id: true } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const siteIds = [...new Set(parsed.data.siteIds)];
  if (siteIds.length > 0) {
    const sites = await prisma.site.findMany({
      where: { id: { in: siteIds } },
      select: { id: true },
    });
    if (sites.length !== siteIds.length) {
      return NextResponse.json({ error: "One or more sites not found" }, { status: 400 });
    }
  }

  await prisma.$transaction([
    prisma.videoSite.deleteMany({ where: { videoId: id } }),
    ...(siteIds.length
      ? [
          prisma.videoSite.createMany({
            data: siteIds.map((siteId) => ({ videoId: id, siteId })),
          }),
        ]
      : []),
  ]);

  const membership = await prisma.videoSite.findMany({
    where: { videoId: id },
    include: { site: { select: { id: true, name: true, domain: true, slug: true, primaryColor: true } } },
  });

  return NextResponse.json({
    ok: true,
    sites: membership.map((m) => m.site),
  });
}

/** Remove a video from a single publication site. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const video = await prisma.video.findUnique({ where: { id }, select: { id: true } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const siteId = url.searchParams.get("siteId")?.trim();
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const result = await prisma.videoSite.deleteMany({ where: { videoId: id, siteId } });
  if (result.count === 0) {
    return NextResponse.json({ error: "Video is not published on that site" }, { status: 404 });
  }

  const membership = await prisma.videoSite.findMany({
    where: { videoId: id },
    include: { site: { select: { id: true, name: true, domain: true, slug: true, primaryColor: true } } },
  });

  return NextResponse.json({
    ok: true,
    sites: membership.map((m) => m.site),
  });
}
