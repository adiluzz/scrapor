import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { enrichPornstarFromTpdb } from "@/lib/enrich-pornstar-tpdb";
import { pornstarImageUrl } from "@/lib/pornstar-image";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const tpdbId = typeof body.tpdbId === "string" ? body.tpdbId.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const imageId = typeof body.imageId === "string" ? body.imageId.trim() : "";

  const result = await enrichPornstarFromTpdb(id, {
    tpdbId: tpdbId || undefined,
    imageUrl: imageUrl || undefined,
    imageId: imageId || undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const star = await prisma.pornstar.findUnique({
    where: { id },
    select: { id: true, s3Image: true },
  });

  return NextResponse.json({
    ok: true,
    source: "theporndb",
    tpdbId: result.tpdbId,
    tpdbName: result.tpdbName,
    metadataSynced: true,
    imageSaved: result.imageSaved,
    imageUrl: result.imageSaved
      ? `/media/pornstar/${id}`
      : star
        ? pornstarImageUrl(star)
        : null,
    syncedAt: result.syncedAt,
  });
}
