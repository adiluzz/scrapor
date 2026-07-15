import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { downloadSiteVideoMedia, submitRedditPost, type RedditPostKind } from "@/lib/reddit";
import { guardRedditRoute, redditErrorResponse } from "@/lib/reddit-admin";

/** Native video upload downloads from S3 and posts to Reddit — can take a while. */
export const maxDuration = 300;

const schema = z.object({
  subreddit: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  kind: z.enum(["self", "link", "image", "video"]),
  text: z.string().max(40000).optional(),
  url: z.string().url().optional(),
  nsfw: z.boolean().optional(),
  spoiler: z.boolean().optional(),
  flairId: z.string().max(80).optional(),
  flairText: z.string().max(64).optional(),
  /** Post a native Reddit video from a library video (uses S3/local mp4 + thumbnail). */
  videoId: z.string().min(1).optional(),
  /** Optional public video page URL to prefer as a link post instead of native upload. */
  linkToVideoPage: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = await params;
  const gated = await guardRedditRoute(request, siteId);
  if ("error" in gated && gated.error) return gated.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }
  const body = parsed.data;
  let kind: RedditPostKind = body.kind;
  let url = body.url;
  let media: { bytes: Buffer; filename: string; contentType: string } | undefined;
  let videoPoster: { bytes: Buffer; filename: string; contentType: string } | undefined;

  try {
    if (body.videoId) {
      const video = await prisma.video.findFirst({
        where: {
          id: body.videoId,
          isDeleted: false,
          OR: [{ siteId }, { sites: { some: { siteId } } }],
        },
        select: {
          id: true,
          siteId: true,
          slug: true,
          title: true,
          s3VideoKey: true,
          s3ThumbKey: true,
          status: true,
        },
      });
      if (!video) {
        return NextResponse.json({ error: "Video not found on this site" }, { status: 404 });
      }
      if (video.status !== "READY") {
        return NextResponse.json({ error: "Video is not ready yet" }, { status: 400 });
      }

      if (body.linkToVideoPage || body.kind === "link") {
        kind = "link";
        const site = await prisma.site.findUnique({ where: { id: siteId }, select: { domain: true } });
        url = `https://${site?.domain}/videos/${video.slug}`;
      } else {
        kind = "video";
        const files = await downloadSiteVideoMedia(video);
        media = files.video;
        videoPoster = files.poster;
      }
    }

    if (kind === "image" && !media) {
      return NextResponse.json(
        { error: "Image posts require an uploaded image (not yet supported standalone); use video from library or a link" },
        { status: 400 }
      );
    }

    const result = await submitRedditPost(gated.creds!, {
      subreddit: body.subreddit,
      title: body.title,
      kind,
      text: body.text,
      url,
      nsfw: body.nsfw ?? true,
      spoiler: body.spoiler,
      flairId: body.flairId,
      flairText: body.flairText,
      media,
      videoPoster,
    });

    return NextResponse.json({ ok: true, post: result, kind });
  } catch (err) {
    return redditErrorResponse(err);
  }
}
