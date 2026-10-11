import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardApiRoute } from "@/lib/admin-guard";
import { localTalentPhotoPath, readStoredObject } from "@/lib/studio-talent-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardApiRoute(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id || id.includes("..") || id.includes("/")) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const talent = await prisma.studioTalent.findUnique({
    where: { id },
    select: { id: true, photoKey: true },
  });
  if (!talent?.photoKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const image = await readStoredObject(talent.photoKey, localTalentPhotoPath(talent.id));
  if (!image) return NextResponse.json({ error: "Image missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.contentLength),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
