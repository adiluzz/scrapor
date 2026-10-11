import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { serializeAdminTalent } from "@/lib/studio-talent-admin";
import {
  deleteStoredObject,
  localTalentPhotoPath,
  saveTalentObject,
  talentPhotoKey,
  validateTalentImage,
} from "@/lib/studio-talent-store";

async function loadTalent(id: string) {
  return prisma.studioTalent.findUnique({
    where: { id },
    include: {
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      site: { select: { id: true, name: true, domain: true } },
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const existing = await prisma.studioTalent.findUnique({
    where: { id },
    select: { id: true, siteId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing image file" }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    validateTalentImage(buffer, contentType);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid image" },
      { status: 400 }
    );
  }

  const key = talentPhotoKey(existing.siteId, existing.id);
  await saveTalentObject(key, localTalentPhotoPath(existing.id), buffer, contentType);
  await prisma.studioTalent.update({
    where: { id: existing.id },
    data: { photoKey: key, photoPath: null },
  });

  const talent = await loadTalent(existing.id);
  return NextResponse.json({
    ok: true,
    talent: talent ? serializeAdminTalent(talent) : null,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "DELETE");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const existing = await prisma.studioTalent.findUnique({
    where: { id },
    select: { id: true, photoKey: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.photoKey) {
    await deleteStoredObject(existing.photoKey, localTalentPhotoPath(existing.id));
  }
  await prisma.studioTalent.update({
    where: { id: existing.id },
    data: { photoKey: null, photoPath: null },
  });

  const talent = await loadTalent(existing.id);
  return NextResponse.json({
    ok: true,
    talent: talent ? serializeAdminTalent(talent) : null,
  });
}
