import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { deleteObject, isS3Configured, s3, S3_BUCKET, s3Keys, uploadBuffer } from "@/lib/storage";

const DOWNLOADS_DIR = join(process.cwd(), "downloads", "talent");

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export function localTalentPhotoPath(talentId: string): string {
  return join(DOWNLOADS_DIR, talentId, "photo.jpg");
}

export function localTalentMediaPath(talentId: string, mediaId: string): string {
  return join(DOWNLOADS_DIR, talentId, "media", mediaId);
}

export function validateTalentImage(buffer: Buffer, contentType: string): void {
  if (!IMAGE_TYPES.has(contentType)) {
    throw new Error("Image must be JPEG, PNG, or WebP");
  }
  if (buffer.length < 500) throw new Error("Image file is too small");
  if (buffer.length > 8 * 1024 * 1024) throw new Error("Image must be under 8MB");
}

export function validateTalentVideo(buffer: Buffer, contentType: string): void {
  if (!VIDEO_TYPES.has(contentType)) {
    throw new Error("Video must be MP4, WebM, or MOV");
  }
  if (buffer.length < 1000) throw new Error("Video file is too small");
  if (buffer.length > 80 * 1024 * 1024) throw new Error("Video must be under 80MB");
}

export function mediaExtension(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "video/webm") return "webm";
  if (contentType === "video/quicktime") return "mov";
  if (contentType.startsWith("video/")) return "mp4";
  return "jpg";
}

export async function saveTalentObject(
  key: string,
  localPath: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  if (isS3Configured()) {
    await uploadBuffer(key, buffer, contentType);
    return;
  }
  mkdirSync(dirname(localPath), { recursive: true });
  writeFileSync(localPath, buffer);
}

export async function readStoredObject(
  key: string,
  localPath: string
): Promise<{ body: Buffer; contentType: string; contentLength: number } | null> {
  if (isS3Configured()) {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      if (!obj.Body) return null;
      const bytes = await obj.Body.transformToByteArray();
      const body = Buffer.from(bytes);
      return {
        body,
        contentType: obj.ContentType || "application/octet-stream",
        contentLength: body.length,
      };
    } catch {
      return null;
    }
  }
  if (!existsSync(localPath)) return null;
  const body = readFileSync(localPath);
  return {
    body,
    contentType: guessLocalContentType(localPath, key),
    contentLength: body.length,
  };
}

export async function deleteStoredObject(key: string, localPath: string): Promise<void> {
  if (isS3Configured()) {
    await deleteObject(key).catch(() => undefined);
    return;
  }
  if (existsSync(localPath)) unlinkSync(localPath);
}

function guessLocalContentType(localPath: string, key: string): string {
  const name = `${localPath} ${key}`.toLowerCase();
  if (name.includes(".png")) return "image/png";
  if (name.includes(".webp")) return "image/webp";
  if (name.includes(".webm")) return "video/webm";
  if (name.includes(".mov")) return "video/quicktime";
  if (name.includes(".mp4") || name.includes("video")) return "video/mp4";
  return "image/jpeg";
}

export function talentPhotoKey(siteId: string, talentId: string): string {
  return s3Keys.talentPhoto(siteId, talentId);
}

export function talentMediaKey(
  siteId: string,
  talentId: string,
  mediaId: string,
  contentType: string
): string {
  return s3Keys.talentMedia(siteId, talentId, mediaId, mediaExtension(contentType));
}
