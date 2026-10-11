import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardApiRoute } from "@/lib/admin-guard";
import { localTalentMediaPath, readStoredObject } from "@/lib/studio-talent-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  const auth = await guardApiRoute(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const { id, mediaId } = await params;
  if (!id || !mediaId || id.includes("..") || mediaId.includes("..")) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const media = await prisma.studioTalentMedia.findFirst({
    where: { id: mediaId, talentId: id },
    select: { id: true, talentId: true, s3Key: true, kind: true },
  });
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = await readStoredObject(media.s3Key, localTalentMediaPath(media.talentId, media.id));
  if (!file) return NextResponse.json({ error: "Media missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.contentLength),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
