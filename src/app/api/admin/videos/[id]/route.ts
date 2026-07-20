import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { invalidateCdnVideoCache } from "@/lib/cdn-cache";
import { linkTags, linkPornstars, linkCategories, resolveAdminVideoSlug } from "@/lib/videos";
import { logger } from "@/lib/logger";

const patchSchema = z.object({
  title: z.string().min(1).max(400).optional(),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().max(8000).nullable().optional(),
  sourceUrl: z.string().url().max(2000).optional(),
  sourceSite: z.string().max(120).nullable().optional(),
  durationSec: z.number().int().min(0).nullable().optional(),
  viewCount: z.number().int().min(0).optional(),
  status: z.enum(["PENDING", "PROCESSING", "READY", "FAILED"]).optional(),
  isDeleted: z.boolean().optional(),
  sourceUploadDate: z.string().datetime().nullable().optional(),
  tags: z.array(z.string()).optional(),
  pornstars: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(_request, "GET");
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const video = await prisma.video.findFirst({
    where: { id },
    include: {
      pornstars: { include: { pornstar: true } },
      tags: { include: { tag: true } },
      categories: { include: { category: true } },
      sites: { include: { site: { select: { id: true, name: true, domain: true, slug: true, primaryColor: true } } } },
    },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    video: {
      id: video.id,
      slug: video.slug,
      title: video.title,
      description: video.description,
      sourceUrl: video.sourceUrl,
      sourceSite: video.sourceSite,
      durationSec: video.durationSec,
      viewCount: video.viewCount,
      status: video.status,
      isDeleted: video.isDeleted,
      sourceUploadDate: video.sourceUploadDate?.toISOString() ?? null,
      createdAt: video.createdAt.toISOString(),
      updatedAt: video.updatedAt.toISOString(),
      previewVersion: video.previewVersion,
      hasPreview: Boolean(video.s3PreviewKey),
      hasVideoSource: Boolean(video.s3VideoKey),
      tags: video.tags.map((t) => t.tag.name),
      tagDetails: video.tags.map((t) => ({
        name: t.tag.name,
        slug: t.tag.slug,
        icon: t.tag.icon,
      })),
      pornstars: video.pornstars.map((p) => p.pornstar.name),
      categories: video.categories.map((c) => c.category.name),
      sites: video.sites.map((vs) => vs.site),
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const video = await prisma.video.findFirst({ where: { id } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  let slug: string | undefined;
  if (d.slug !== undefined || d.title !== undefined) {
    try {
      slug = await resolveAdminVideoSlug(
        video.siteId,
        id,
        d.slug,
        d.title ?? video.title
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid slug";
      return NextResponse.json({ error: message }, { status: 409 });
    }
  }

  if (d.sourceUrl && d.sourceUrl !== video.sourceUrl) {
    const clash = await prisma.video.findUnique({ where: { sourceUrl: d.sourceUrl } });
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: "sourceUrl already used by another video" }, { status: 409 });
    }
  }

  await prisma.video.update({
    where: { id },
    data: {
      title: d.title ?? undefined,
      slug: slug ?? undefined,
      description: d.description === undefined ? undefined : d.description,
      sourceUrl: d.sourceUrl ?? undefined,
      sourceSite: d.sourceSite === undefined ? undefined : d.sourceSite,
      durationSec: d.durationSec === undefined ? undefined : d.durationSec,
      viewCount: d.viewCount ?? undefined,
      status: d.status ?? undefined,
      isDeleted: d.isDeleted ?? undefined,
      deletedAt: d.isDeleted === true ? new Date() : d.isDeleted === false ? null : undefined,
      sourceUploadDate:
        d.sourceUploadDate === undefined
          ? undefined
          : d.sourceUploadDate
            ? new Date(d.sourceUploadDate)
            : null,
    },
  });

  if (d.isDeleted !== undefined || d.status !== undefined) {
    await invalidateCdnVideoCache(id);
  }

  if (d.tags) {
    await prisma.videoTag.deleteMany({ where: { videoId: id } });
    await linkTags(video.siteId, id, d.tags);
  }
  if (d.pornstars) {
    await prisma.videoPornstar.deleteMany({ where: { videoId: id } });
    await linkPornstars(video.siteId, id, d.pornstars);
  }
  if (d.categories) {
    await prisma.videoCategory.deleteMany({ where: { videoId: id } });
    await linkCategories(video.siteId, id, d.categories);
  }

  logger.info({ videoId: id, fields: Object.keys(d) }, "admin updated video");
  return NextResponse.json({ ok: true });
}

/** Soft delete (default) — sets isDeleted so CDN access is immediately revoked. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(_request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const video = await prisma.video.findFirst({ where: { id } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.video.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
  await invalidateCdnVideoCache(id);
  logger.info({ videoId: id }, "admin soft-deleted video");
  return NextResponse.json({ ok: true });
}
