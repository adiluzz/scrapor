import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { linkTags, linkPornstars } from "@/lib/videos";
import { logger } from "@/lib/logger";

const patchSchema = z.object({
  title: z.string().min(1).max(400).optional(),
  description: z.string().max(8000).nullable().optional(),
  isDeleted: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  pornstars: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const video = await prisma.video.findFirst({ where: { id, siteId: g.siteId } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  await prisma.video.update({
    where: { id },
    data: {
      title: d.title ?? undefined,
      description: d.description === undefined ? undefined : d.description,
      isDeleted: d.isDeleted ?? undefined,
      deletedAt: d.isDeleted === true ? new Date() : d.isDeleted === false ? null : undefined,
    },
  });

  // Replace taxonomy if provided.
  if (d.tags) {
    await prisma.videoTag.deleteMany({ where: { videoId: id } });
    await linkTags(g.siteId, id, d.tags);
  }
  if (d.pornstars) {
    await prisma.videoPornstar.deleteMany({ where: { videoId: id } });
    await linkPornstars(g.siteId, id, d.pornstars);
  }

  logger.info({ videoId: id, isDeleted: d.isDeleted }, "admin updated video");
  return NextResponse.json({ ok: true });
}

/** Soft delete (default) — sets isDeleted so CDN access is immediately revoked. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(_request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const video = await prisma.video.findFirst({ where: { id, siteId: g.siteId } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.video.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  logger.info({ videoId: id }, "admin soft-deleted video");
  return NextResponse.json({ ok: true });
}