import { headers } from "next/headers";
import { isS3Configured } from "@/lib/storage";
import { mintAssetUrl } from "@/lib/cdn";

/** Best-effort client IP from proxy headers (for IP-bound signed URLs). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") || "0.0.0.0";
}

type VideoMediaFields = {
  id: string;
  s3ThumbKey?: string | null;
  s3PreviewKey?: string | null;
  s3StoryboardKey?: string | null;
  s3StoryboardVttKey?: string | null;
};

/**
 * Resolve the thumbnail image URL for a video. Uses the signed CDN asset URL
 * when S3 is configured, otherwise falls back to the local dev thumbnail route.
 */
export async function thumbUrl(video: VideoMediaFields): Promise<string> {
  if (isS3Configured() && video.s3ThumbKey) {
    return mintAssetUrl({ videoId: video.id, file: "thumbnail.jpg", clientIp: await getClientIp() });
  }
  return `/api/thumbnail-img/${video.id}`;
}

/** Hover-preview clip URL. */
export async function previewUrl(video: VideoMediaFields): Promise<string> {
  if (isS3Configured() && video.s3PreviewKey) {
    return mintAssetUrl({ videoId: video.id, file: "preview.mp4", clientIp: await getClientIp() });
  }
  return `/api/thumbnail/${video.id}`;
}

/** Storyboard sprite + WebVTT URLs for scrubber thumbnails (null when unavailable). */
export async function storyboardUrls(
  video: VideoMediaFields
): Promise<{ sprite: string; vtt: string } | null> {
  if (isS3Configured() && video.s3StoryboardKey && video.s3StoryboardVttKey) {
    const ip = await getClientIp();
    return {
      sprite: mintAssetUrl({ videoId: video.id, file: "storyboard.jpg", clientIp: ip }),
      vtt: mintAssetUrl({ videoId: video.id, file: "storyboard.vtt", clientIp: ip }),
    };
  }
  return null;
}
