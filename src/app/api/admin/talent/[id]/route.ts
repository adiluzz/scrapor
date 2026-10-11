import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { serializeAdminTalent } from "@/lib/studio-talent-admin";
import { serializeTalentLanguages, slugifyTalentName, toDbRegion } from "@/lib/studio-talent";
import { deleteStoredObject, localTalentMediaPath, localTalentPhotoPath } from "@/lib/studio-talent-store";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().min(1).max(80).optional(),
  role: z.string().max(80).optional(),
  region: z.enum(["israel", "international", "ISRAEL", "INTERNATIONAL"]).optional(),
  origin: z.string().max(160).optional(),
  basedIn: z.string().max(160).optional(),
  languages: z.array(z.string().max(40)).optional(),
  signed: z.string().max(20).nullable().optional(),
  featured: z.boolean().optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  tagline: z.string().max(240).nullable().optional(),
  bio: z.string().max(8000).nullable().optional(),
  grade: z.string().max(240).nullable().optional(),
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const talent = await loadTalent(id);
  if (!talent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ talent: serializeAdminTalent(talent) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "PATCH");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const existing = await prisma.studioTalent.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = updateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid talent data" }, { status: 400 });
  }

  const d = body.data;
  const slug = d.slug ? slugifyTalentName(d.slug) : undefined;
  if (d.slug && !slug) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }
  if (slug && slug !== existing.slug) {
    const clash = await prisma.studioTalent.findUnique({
      where: { siteId_slug: { siteId: existing.siteId, slug } },
      select: { id: true },
    });
    if (clash) {
      return NextResponse.json({ error: "A talent with that slug already exists" }, { status: 409 });
    }
  }

  const talent = await prisma.studioTalent.update({
    where: { id },
    data: {
      name: d.name?.trim(),
      slug,
      role: d.role?.trim(),
      region: d.region ? toDbRegion(d.region) : undefined,
      origin: d.origin,
      basedIn: d.basedIn,
      languages: d.languages ? serializeTalentLanguages(d.languages) : undefined,
      signed: d.signed === undefined ? undefined : d.signed?.trim() || null,
      featured: d.featured,
      published: d.published,
      sortOrder: d.sortOrder,
      tagline: d.tagline === undefined ? undefined : d.tagline?.trim() || null,
      bio: d.bio === undefined ? undefined : d.bio?.trim() || null,
      grade: d.grade === undefined ? undefined : d.grade?.trim() || null,
    },
    include: {
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      site: { select: { id: true, name: true, domain: true } },
    },
  });

  return NextResponse.json({ talent: serializeAdminTalent(talent) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "DELETE");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const talent = await prisma.studioTalent.findUnique({
    where: { id },
    include: { media: true },
  });
  if (!talent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (talent.photoKey) {
    await deleteStoredObject(talent.photoKey, localTalentPhotoPath(talent.id));
  }
  for (const item of talent.media) {
    await deleteStoredObject(item.s3Key, localTalentMediaPath(talent.id, item.id));
  }
  await prisma.studioTalent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
