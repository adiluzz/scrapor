import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

const region = process.env.AWS_REGION || "us-east-1";
const bucket = process.env.S3_BUCKET || "pisster-media";
const endpoint = process.env.S3_ENDPOINT || undefined;

const globalForS3 = globalThis as unknown as { s3?: S3Client };

export const s3: S3Client =
  globalForS3.s3 ||
  new S3Client({
    region,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForS3.s3 = s3;

export const S3_BUCKET = bucket;

/** True when S3 credentials are configured (production). */
export function isS3Configured(): boolean {
  return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET);
}

// ─── Key layout ──────────────────────────────────────────────────────
// sites/{siteId}/videos/{videoId}/video.mp4 | thumbnail.jpg | preview.mp4
//                                 storyboard.jpg | storyboard.vtt
// sites/{siteId}/pornstars/{pornstarId}/image.jpg
// sites/{siteId}/creators/{creatorId}/avatar.jpg

export const s3Keys = {
  video: (siteId: string, videoId: string) => `sites/${siteId}/videos/${videoId}/video.mp4`,
  thumb: (siteId: string, videoId: string) => `sites/${siteId}/videos/${videoId}/thumbnail.jpg`,
  preview: (siteId: string, videoId: string) => `sites/${siteId}/videos/${videoId}/preview.mp4`,
  storyboard: (siteId: string, videoId: string) => `sites/${siteId}/videos/${videoId}/storyboard.jpg`,
  storyboardVtt: (siteId: string, videoId: string) => `sites/${siteId}/videos/${videoId}/storyboard.vtt`,
  pornstarImage: (siteId: string, pornstarId: string) => `sites/${siteId}/pornstars/${pornstarId}/image.jpg`,
  creatorAvatar: (siteId: string, creatorId: string) => `sites/${siteId}/creators/${creatorId}/avatar.jpg`,
};

export function resolveVideoStorageKey(video: {
  id: string;
  siteId: string;
  s3VideoKey?: string | null;
}): string {
  return video.s3VideoKey || s3Keys.video(video.siteId, video.id);
}

/** Write an S3 object to disk (Node 24 ChecksumStream-safe). */
export async function downloadS3ObjectToFile(key: string, destPath: string): Promise<void> {
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!obj.Body) throw new Error("Empty S3 object");
  await pipeline(obj.Body as unknown as Readable, createWriteStream(destPath));
}

export async function uploadBuffer(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );
  return key;
}

/** Presigned GET URL (default 60s) — nginx uses this internally to fetch private objects. */
export function presignGet(key: string, expiresIn = 60): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}

/** Presigned PUT URL for direct browser uploads (creator uploads). */
export function presignPut(key: string, contentType: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Server-side copy within the same bucket (e.g. promo render → library video). */
export async function copyS3Object(sourceKey: string, destKey: string): Promise<string> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourceKey}`,
      Key: destKey,
      ContentType: "video/mp4",
      MetadataDirective: "REPLACE",
    })
  );
  return destKey;
}
