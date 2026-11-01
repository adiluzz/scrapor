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
import { Writable, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

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
    // Default WHEN_SUPPORTED asks S3 for trailing checksums. On Node 24 those
    // trailers never end the body stream, so image routes hang with no bytes.
    responseChecksumValidation: "WHEN_REQUIRED",
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
  hlsMaster: (siteId: string, videoId: string) => `sites/${siteId}/videos/${videoId}/hls/master.m3u8`,
  hlsPrefix: (siteId: string, videoId: string) => `sites/${siteId}/videos/${videoId}/hls/`,
  pornstarImage: (siteId: string, pornstarId: string) => `sites/${siteId}/pornstars/${pornstarId}/image.jpg`,
  creatorAvatar: (siteId: string, creatorId: string) => `sites/${siteId}/creators/${creatorId}/avatar.jpg`,
  talentPhoto: (siteId: string, talentId: string) => `sites/${siteId}/talent/${talentId}/photo.jpg`,
  talentMedia: (siteId: string, talentId: string, mediaId: string, ext: string) =>
    `sites/${siteId}/talent/${talentId}/media/${mediaId}.${ext}`,
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

/**
 * Read an S3 object into memory. Uses pipeline instead of transformToByteArray(),
 * which hangs on Node 24 when the SDK wraps the body in a checksum stream.
 */
export async function readS3ObjectBuffer(
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!obj.Body) return null;
    const chunks: Buffer[] = [];
    await pipeline(
      obj.Body as unknown as Readable,
      new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          callback();
        },
      })
    );
    if (chunks.length === 0) return null;
    return {
      body: Buffer.concat(chunks),
      contentType: obj.ContentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

/** Read a small S3 text object (HLS playlists). Same Node 24-safe path as readS3ObjectBuffer. */
export async function readS3ObjectText(key: string): Promise<string | null> {
  const obj = await readS3ObjectBuffer(key);
  if (!obj || obj.body.length === 0) return null;
  return obj.body.toString("utf8");
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
