import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { isS3Configured, readS3ObjectBuffer, s3Keys } from "@/lib/storage";

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
): Promise<{ body: Buffer; contentType: string; contentLength: number } | null> {
  const key = pornstarImageKey(pornstar);

  if (isS3Configured()) {
    const obj = await readS3ObjectBuffer(key);
    if (!obj) return null;
    return {
      body: obj.body,
      contentType: obj.contentType.startsWith("image/") ? obj.contentType : "image/jpeg",
      contentLength: obj.body.length,
    };
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
