import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { serializeAdminTalent } from "@/lib/studio-talent-admin";
import { deleteStoredObject, localTalentMediaPath } from "@/lib/studio-talent-store";

const patchSchema = z.object({
  title: z.string().max(160).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

async function loadTalent(id: string) {
  return prisma.studioTalent.findUnique({
    where: { id },
    include: {
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      site: { select: { id: true, name: true, domain: true } },
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  const auth = await guardAdmin(request, "PATCH");
  if (auth instanceof NextResponse) return auth;
  const { id, mediaId } = await params;
  const media = await prisma.studioTalentMedia.findFirst({
    where: { id: mediaId, talentId: id },
  });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid media data" }, { status: 400 });
  }

  await prisma.studioTalentMedia.update({
    where: { id: media.id },
    data: {
      title: body.data.title === undefined ? undefined : body.data.title?.trim() || null,
      sortOrder: body.data.sortOrder,
    },
  });

  const talent = await loadTalent(id);
  return NextResponse.json({ talent: talent ? serializeAdminTalent(talent) : null });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  const auth = await guardAdmin(request, "DELETE");
  if (auth instanceof NextResponse) return auth;
  const { id, mediaId } = await params;
  const media = await prisma.studioTalentMedia.findFirst({
    where: { id: mediaId, talentId: id },
  });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteStoredObject(media.s3Key, localTalentMediaPath(id, media.id));
  await prisma.studioTalentMedia.delete({ where: { id: media.id } });

  const talent = await loadTalent(id);
  return NextResponse.json({ ok: true, talent: talent ? serializeAdminTalent(talent) : null });
}
