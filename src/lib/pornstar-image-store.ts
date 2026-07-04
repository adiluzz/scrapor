import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { prisma } from "@/lib/db";
import { isS3Configured, s3Keys, uploadBuffer } from "@/lib/storage";
import { localPornstarImagePath } from "@/lib/pornstar-image";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validatePornstarImage(
  buffer: Buffer,
  contentType: string
): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_TYPES.has(contentType)) {
    return { ok: false, error: "Image must be JPEG, PNG, or WebP" };
  }
  if (buffer.length < 500) {
    return { ok: false, error: "Image file is too small" };
  }
  if (buffer.length > 8 * 1024 * 1024) {
    return { ok: false, error: "Image must be under 8MB" };
  }
  return { ok: true };
}

/** Persist a pornstar portrait to S3 or local dev storage. */
export async function savePornstarImage(
  siteId: string,
  pornstarId: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const validation = validatePornstarImage(buffer, contentType);
  if (!validation.ok) throw new Error(validation.error);

  const key = s3Keys.pornstarImage(siteId, pornstarId);

  if (isS3Configured()) {
    await uploadBuffer(key, buffer, contentType);
  } else {
    const path = localPornstarImagePath(pornstarId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
  }

  await prisma.pornstar.update({
    where: { id: pornstarId },
    data: { s3Image: key },
  });

  return key;
}
