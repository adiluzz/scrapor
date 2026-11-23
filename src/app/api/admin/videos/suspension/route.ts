import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { adminVideoListWhere } from "@/lib/admin-videos";
import { logger } from "@/lib/logger";

const filterSchema = z.object({
  q: z.string().max(200).optional(),
  siteId: z.string().min(1).optional(),
  orphans: z.boolean().optional(),
  suspension: z.enum(["visible", "suspended"]).optional(),
});

const bodySchema = z
  .object({
    suspended: z.boolean(),
    /** When set, only this publication site changes. Slug and membership stay. */
    siteId: z.string().min(1).optional(),
    videoIds: z.array(z.string().min(1)).min(1).max(500).optional(),
    pornstarId: z.string().min(1).optional(),
    allMatching: filterSchema.optional(),
  })
  .refine(
    (d) =>
      [Boolean(d.videoIds?.length), Boolean(d.pornstarId), Boolean(d.allMatching)].filter(Boolean)
        .length === 1,
    { message: "Provide videoIds, pornstarId, or allMatching" }
  );

/**
 * Suspend or unsuspend publication rows.
 * The video slug and /videos/{slug} URL stay; a suspended page returns 404.
 */
export async function POST(request: Request) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  if (data.pornstarId) {
    const star = await prisma.pornstar.findUnique({
      where: { id: data.pornstarId },
      select: { id: true },
    });
    if (!star) return NextResponse.json({ error: "Pornstar not found" }, { status: 404 });
  }

  const membershipSiteId = data.siteId ?? data.allMatching?.siteId;
  if (membershipSiteId) {
    const site = await prisma.site.findUnique({
      where: { id: membershipSiteId },
      select: { id: true },
    });
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const videoWhere = data.videoIds
    ? { id: { in: [...new Set(data.videoIds)] } }
    : data.pornstarId
      ? { pornstars: { some: { pornstarId: data.pornstarId } } }
      : adminVideoListWhere({
          q: data.allMatching?.q,
          siteId: data.allMatching?.siteId,
          orphans: data.allMatching?.orphans,
          suspension: data.allMatching?.suspension,
        });

  const result = await prisma.videoSite.updateMany({
    where: {
      ...(membershipSiteId ? { siteId: membershipSiteId } : {}),
      video: videoWhere,
    },
    data: {
      suspended: data.suspended,
      suspendedAt: data.suspended ? new Date() : null,
    },
  });

  logger.info(
    {
      suspended: data.suspended,
      siteId: membershipSiteId ?? null,
      pornstarId: data.pornstarId ?? null,
      videoCount: data.videoIds?.length ?? null,
      allMatching: Boolean(data.allMatching),
      updated: result.count,
    },
    "admin updated video suspension"
  );

  return NextResponse.json({ ok: true, updated: result.count });
}
