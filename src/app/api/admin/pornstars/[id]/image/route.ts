import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { savePornstarImage } from "@/lib/pornstar-image-store";
import { pornstarImageUrl } from "@/lib/pornstar-image";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const star = await prisma.pornstar.findUnique({
    where: { id },
    select: { id: true, siteId: true },
  });
  if (!star) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing image file" }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await savePornstarImage(star.siteId, star.id, buffer, contentType);
    return NextResponse.json({
      ok: true,
      imageUrl: `/media/pornstar/${star.id}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "DELETE");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const star = await prisma.pornstar.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!star) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.pornstar.update({
    where: { id: star.id },
    data: { s3Image: null },
  });

  return NextResponse.json({ ok: true });
}
