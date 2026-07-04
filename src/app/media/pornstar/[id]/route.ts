import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSiteIdForAuth } from "@/lib/site";
import { guardApiRoute } from "@/lib/admin-guard";
import { readPornstarImage } from "@/lib/pornstar-image";

/** Public pornstar portrait image (S3 or local dev). */
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

  const siteId = await getSiteIdForAuth(auth);
  const star = await prisma.pornstar.findFirst({
    where: { id, siteId },
    select: { id: true, siteId: true, s3Image: true },
  });
  if (!star?.s3Image) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const image = await readPornstarImage(star);
  if (!image) {
    return NextResponse.json({ error: "Image missing" }, { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": image.contentType,
    "Cache-Control": "public, max-age=86400",
  };
  if (image.contentLength) {
    headers["Content-Length"] = String(image.contentLength);
  }

  return new NextResponse(image.body, { headers });
}
