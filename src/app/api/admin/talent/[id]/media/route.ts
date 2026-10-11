import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { serializeAdminTalent } from "@/lib/studio-talent-admin";
import {
  localTalentMediaPath,
  saveTalentObject,
  talentMediaKey,
  validateTalentImage,
  validateTalentVideo,
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
    return NextResponse.json({ error: "Missing media file" }, { status: 400 });
  }

  const kindRaw = String(form?.get("kind") || "").toLowerCase();
  const title = String(form?.get("title") || "").trim() || null;
  const contentType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());
  const kind =
    kindRaw === "video" || contentType.startsWith("video/")
      ? "VIDEO"
      : kindRaw === "image" || contentType.startsWith("image/")
        ? "IMAGE"
        : null;
  if (!kind) {
    return NextResponse.json({ error: "Upload an image or a video" }, { status: 400 });
  }

  try {
    if (kind === "IMAGE") validateTalentImage(buffer, contentType);
    else validateTalentVideo(buffer, contentType);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid file" },
      { status: 400 }
    );
  }

  const last = await prisma.studioTalentMedia.findFirst({
    where: { talentId: existing.id, kind },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await prisma.studioTalentMedia.create({
    data: {
      talentId: existing.id,
      kind,
      s3Key: "pending",
      title,
      sortOrder: (last?.sortOrder ?? -10) + 10,
    },
  });

  const key = talentMediaKey(existing.siteId, existing.id, created.id, contentType);
  await saveTalentObject(key, localTalentMediaPath(existing.id, created.id), buffer, contentType);
  await prisma.studioTalentMedia.update({
    where: { id: created.id },
    data: { s3Key: key },
  });

  const talent = await loadTalent(existing.id);
  return NextResponse.json({
    ok: true,
    talent: talent ? serializeAdminTalent(talent) : null,
  });
}
