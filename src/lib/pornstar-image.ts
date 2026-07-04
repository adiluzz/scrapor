import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { isS3Configured, s3, S3_BUCKET, s3Keys } from "@/lib/storage";

const DOWNLOADS_DIR = join(process.cwd(), "downloads", "pornstars");

type PornstarImageFields = {
  id: string;
  siteId: string;
  s3Image?: string | null;
};

/** Public URL for a pornstar portrait when one is stored. */
export function pornstarImageUrl(pornstar: { id: string; s3Image?: string | null }): string | null {
  if (!pornstar.s3Image) return null;
  return `/media/pornstar/${pornstar.id}`;
}

export function pornstarImageKey(pornstar: PornstarImageFields): string {
  return pornstar.s3Image || s3Keys.pornstarImage(pornstar.siteId, pornstar.id);
}

export function localPornstarImagePath(pornstarId: string): string {
  return join(DOWNLOADS_DIR, pornstarId, "image.jpg");
}

export async function readPornstarImage(
  pornstar: PornstarImageFields
): Promise<{ body: BodyInit; contentType: string; contentLength?: number } | null> {
  const key = pornstarImageKey(pornstar);

  if (isS3Configured()) {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      if (!obj.Body) return null;
      const bytes = await obj.Body.transformToByteArray();
      return {
        body: Buffer.from(bytes),
        contentType: obj.ContentType || "image/jpeg",
        contentLength: bytes.length,
      };
    } catch {
      return null;
    }
  }

  const localPath = localPornstarImagePath(pornstar.id);
  if (!existsSync(localPath)) return null;
  const buffer = readFileSync(localPath);
  return {
    body: buffer,
    contentType: "image/jpeg",
    contentLength: buffer.length,
  };
}
