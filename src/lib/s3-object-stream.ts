import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3, S3_BUCKET } from "@/lib/storage";

/** Stream a private S3 object, honoring Range so crawlers can fetch video bytes. */
export async function streamS3Object(
  key: string,
  request: Request,
  contentType: string,
  cacheControl: string
): Promise<NextResponse> {
  const range = request.headers.get("range");
  try {
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ...(range ? { Range: range } : {}),
      })
    );
    if (!obj.Body) return new NextResponse("Not found", { status: 404 });

    const headers = new Headers({
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    });
    if (obj.ContentLength != null) headers.set("Content-Length", String(obj.ContentLength));
    if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange);

    const status = range && obj.ContentRange ? 206 : 200;
    return new NextResponse(obj.Body.transformToWebStream(), { status, headers });
  } catch {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
