import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { slugify } from "@/lib/slug";
import { logger } from "@/lib/logger";

const patchSchema = z.object({
  displayName: z.string().min(2).max(60).optional(),
  slug: z.string().optional(),
  bio: z.string().max(2000).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;
  const creator = await prisma.creatorProfile.findFirst({ where: { id, siteId: g.siteId } });
  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  await prisma.creatorProfile.update({
    where: { id },
    data: {
      displayName: d.displayName ?? undefined,
      slug: d.slug ? slugify(d.slug) : undefined,
      bio: d.bio === undefined ? undefined : d.bio,
    },
  });
  return NextResponse.json({ ok: true });
}

/**
 * Delete a creator: soft-delete their videos and remove the profile, demoting
 * the user back to USER.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(_request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;
  const creator = await prisma.creatorProfile.findFirst({ where: { id, siteId: g.siteId } });
  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.video.updateMany({
    where: { creatorId: id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await prisma.user.update({ where: { id: creator.userId }, data: { role: "USER" } });
  await prisma.creatorProfile.delete({ where: { id } });

  logger.info({ creatorId: id }, "admin deleted creator");
  return NextResponse.json({ ok: true });
}