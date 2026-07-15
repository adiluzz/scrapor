import { GetObjectCommand } from "@aws-sdk/client-s3";
import { S3_BUCKET, isS3Configured, s3, s3Keys } from "@/lib/storage";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const OAUTH_BASE = "https://oauth.reddit.com";

export type RedditCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken?: string | null;
  username?: string | null;
  password?: string | null;
  userAgent?: string | null;
};

export type RedditIdentity = {
  name: string;
  id: string;
  linkKarma: number;
  commentKarma: number;
};

export type RedditSubreddit = {
  name: string;
  title: string;
  subscribers: number;
  nsfw: boolean;
  userIsModerator: boolean;
};

export type RedditPostKind = "self" | "link" | "image" | "video";

export type RedditSubmitInput = {
  subreddit: string;
  title: string;
  kind: RedditPostKind;
  text?: string;
  url?: string;
  nsfw?: boolean;
  spoiler?: boolean;
  flairId?: string;
  flairText?: string;
  resubmit?: boolean;
  sendReplies?: boolean;
  /** Required for kind=video — poster/thumbnail image bytes. */
  videoPoster?: { bytes: Buffer; filename: string; contentType: string };
  /** Required for kind=image or video — media bytes. */
  media?: { bytes: Buffer; filename: string; contentType: string };
};

export type RedditSubmitResult = {
  url: string | null;
  id: string | null;
  name: string | null;
};

export type CreateSubredditInput = {
  name: string;
  title: string;
  publicDescription?: string;
  description?: string;
  type?: "public" | "restricted" | "private";
  over18?: boolean;
};

class RedditApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "RedditApiError";
  }
}

function defaultUserAgent(creds: RedditCredentials): string {
  if (creds.userAgent?.trim()) return creds.userAgent.trim();
  const by = creds.username?.trim() || "unknown";
  return `web:scrapor-reddit:1.0.0 (by /u/${by})`;
}

function basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

function assertConfigured(creds: RedditCredentials): void {
  if (!creds.clientId?.trim() || !creds.clientSecret?.trim()) {
    throw new RedditApiError("Reddit client ID and secret are required");
  }
  const hasRefresh = Boolean(creds.refreshToken?.trim());
  const hasPassword = Boolean(creds.username?.trim() && creds.password?.trim());
  if (!hasRefresh && !hasPassword) {
    throw new RedditApiError(
      "Provide a refresh token, or username + password for a script-type Reddit app"
    );
  }
}

async function fetchAccessToken(creds: RedditCredentials): Promise<string> {
  assertConfigured(creds);
  const body = new URLSearchParams();
  if (creds.refreshToken?.trim()) {
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", creds.refreshToken.trim());
  } else {
    body.set("grant_type", "password");
    body.set("username", creds.username!.trim());
    body.set("password", creds.password!.trim());
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(creds.clientId.trim(), creds.clientSecret.trim())}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": defaultUserAgent(creds),
    },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
    message?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new RedditApiError(
      data.error_description || data.error || data.message || "Failed to obtain Reddit access token",
      res.status,
      data
    );
  }
  return data.access_token;
}

async function redditFetch(
  creds: RedditCredentials,
  path: string,
  init: RequestInit & { form?: URLSearchParams } = {}
): Promise<unknown> {
  const token = await fetchAccessToken(creds);
  const { form, headers: extraHeaders, ...rest } = init;
  const headers = new Headers(extraHeaders);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("User-Agent", defaultUserAgent(creds));
  if (form && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  }

  const res = await fetch(`${OAUTH_BASE}${path}`, {
    ...rest,
    headers,
    body: form ?? rest.body,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "message" in data
        ? String((data as { message?: string }).message)
        : typeof data === "string"
          ? data.slice(0, 300)
          : `Reddit API error (${res.status})`;
    throw new RedditApiError(msg || `Reddit API error (${res.status})`, res.status, data);
  }
  return data;
}

function extractJsonErrors(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const json = (data as { json?: { errors?: unknown[] } }).json;
  const errors = json?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (Array.isArray(first)) return first.filter(Boolean).map(String).join(": ");
  return String(first);
}

export async function getRedditIdentity(creds: RedditCredentials): Promise<RedditIdentity> {
  const data = (await redditFetch(creds, "/api/v1/me")) as {
    name?: string;
    id?: string;
    link_karma?: number;
    comment_karma?: number;
  };
  if (!data?.name) throw new RedditApiError("Unexpected /api/v1/me response", undefined, data);
  return {
    name: data.name,
    id: data.id || "",
    linkKarma: data.link_karma ?? 0,
    commentKarma: data.comment_karma ?? 0,
  };
}

export async function listUserSubreddits(creds: RedditCredentials): Promise<RedditSubreddit[]> {
  const data = (await redditFetch(creds, "/subreddits/mine/subscriber?limit=100&raw_json=1")) as {
    data?: {
      children?: Array<{
        data?: {
          display_name?: string;
          title?: string;
          subscribers?: number;
          over18?: boolean;
          user_is_moderator?: boolean;
        };
      }>;
    };
  };
  const children = data?.data?.children || [];
  return children
    .map((c) => c.data)
    .filter(Boolean)
    .map((d) => ({
      name: d!.display_name || "",
      title: d!.title || "",
      subscribers: d!.subscribers ?? 0,
      nsfw: Boolean(d!.over18),
      userIsModerator: Boolean(d!.user_is_moderator),
    }))
    .filter((s) => s.name);
}

export async function listModeratedSubreddits(creds: RedditCredentials): Promise<RedditSubreddit[]> {
  const data = (await redditFetch(creds, "/subreddits/mine/moderator?limit=100&raw_json=1")) as {
    data?: {
      children?: Array<{
        data?: {
          display_name?: string;
          title?: string;
          subscribers?: number;
          over18?: boolean;
          user_is_moderator?: boolean;
        };
      }>;
    };
  };
  const children = data?.data?.children || [];
  return children
    .map((c) => c.data)
    .filter(Boolean)
    .map((d) => ({
      name: d!.display_name || "",
      title: d!.title || "",
      subscribers: d!.subscribers ?? 0,
      nsfw: Boolean(d!.over18),
      userIsModerator: true,
    }))
    .filter((s) => s.name);
}

export async function createSubreddit(
  creds: RedditCredentials,
  input: CreateSubredditInput
): Promise<{ name: string; url: string }> {
  const name = input.name.replace(/^r\//i, "").trim();
  if (!/^[A-Za-z0-9_]{3,21}$/.test(name)) {
    throw new RedditApiError("Subreddit name must be 3–21 chars: letters, numbers, underscore");
  }
  const form = new URLSearchParams();
  form.set("api_type", "json");
  form.set("name", name);
  form.set("title", input.title.trim().slice(0, 100) || name);
  form.set("public_description", (input.publicDescription || "").slice(0, 500));
  form.set("description", (input.description || "").slice(0, 5000));
  form.set("type", input.type || "public");
  form.set("link_type", "any");
  form.set("over_18", input.over18 ? "true" : "false");
  form.set("allow_top", "true");
  form.set("show_media", "true");
  form.set("wikimode", "modonly");
  // Creating (not updating) a community — omit `sr`.

  // Same endpoint PRAW uses for subreddit create/update.
  const data = await redditFetch(creds, "/api/site_admin", { method: "POST", form });
  const err = extractJsonErrors(data);
  if (err) throw new RedditApiError(err, undefined, data);

  return { name, url: `https://www.reddit.com/r/${name}/` };
}

type MediaLease = {
  uploadUrl: string;
  fields: Array<{ name: string; value: string }>;
  assetId: string;
  websocketUrl?: string;
};

async function requestMediaLease(
  creds: RedditCredentials,
  filename: string,
  mimetype: string
): Promise<MediaLease> {
  const form = new URLSearchParams();
  form.set("filepath", filename);
  form.set("mimetype", mimetype);

  const data = (await redditFetch(creds, "/api/media/asset.json", {
    method: "POST",
    form,
  })) as {
    args?: { action?: string; fields?: Array<{ name?: string; value?: string }> };
    asset?: { asset_id?: string; websocket_url?: string };
  };

  const action = data?.args?.action;
  const fields = (data?.args?.fields || [])
    .filter((f) => f.name && f.value != null)
    .map((f) => ({ name: f.name!, value: String(f.value) }));
  const assetId = data?.asset?.asset_id;
  if (!action || !fields.length || !assetId) {
    throw new RedditApiError("Reddit media lease missing action/fields/asset_id", undefined, data);
  }

  const uploadUrl = action.startsWith("http") ? action : `https:${action}`;
  return {
    uploadUrl,
    fields,
    assetId,
    websocketUrl: data.asset?.websocket_url,
  };
}

async function uploadMediaToReddit(
  creds: RedditCredentials,
  file: { bytes: Buffer; filename: string; contentType: string }
): Promise<string> {
  const lease = await requestMediaLease(creds, file.filename, file.contentType);
  const form = new FormData();
  for (const field of lease.fields) {
    form.append(field.name, field.value);
  }
  const keyField = lease.fields.find((f) => f.name === "key");
  form.append(
    "file",
    new Blob([new Uint8Array(file.bytes)], { type: file.contentType }),
    file.filename
  );

  const uploadRes = await fetch(lease.uploadUrl, { method: "POST", body: form });
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => "");
    throw new RedditApiError(
      `Reddit CDN upload failed (${uploadRes.status})`,
      uploadRes.status,
      body.slice(0, 500)
    );
  }

  // Native media posts need the raw S3 object URL (lease upload host + key).
  if (!keyField?.value) {
    throw new RedditApiError("Reddit media lease missing key field", undefined, lease);
  }
  const base = lease.uploadUrl.replace(/\/$/, "");
  return `${base}/${keyField.value}`;
}

export async function submitRedditPost(
  creds: RedditCredentials,
  input: RedditSubmitInput
): Promise<RedditSubmitResult> {
  const sr = input.subreddit.replace(/^r\//i, "").trim();
  if (!sr) throw new RedditApiError("Subreddit is required");
  if (!input.title.trim()) throw new RedditApiError("Title is required");

  let url = input.url?.trim() || "";
  let videoPosterUrl = "";

  if (input.kind === "image" || input.kind === "video") {
    if (!input.media?.bytes?.length) {
      throw new RedditApiError(`${input.kind} posts require media bytes`);
    }
    url = await uploadMediaToReddit(creds, input.media);
    if (input.kind === "video") {
      if (!input.videoPoster?.bytes?.length) {
        throw new RedditApiError("Video posts require a poster/thumbnail image");
      }
      videoPosterUrl = await uploadMediaToReddit(creds, input.videoPoster);
    }
  }

  if (input.kind === "link" && !url) {
    throw new RedditApiError("Link posts require a URL");
  }

  const form = new URLSearchParams();
  form.set("api_type", "json");
  form.set("sr", sr);
  form.set("title", input.title.trim().slice(0, 300));
  form.set("kind", input.kind);
  form.set("nsfw", input.nsfw ? "true" : "false");
  form.set("spoiler", input.spoiler ? "true" : "false");
  form.set("resubmit", input.resubmit === false ? "false" : "true");
  form.set("sendreplies", input.sendReplies === false ? "false" : "true");
  if (input.flairId) form.set("flair_id", input.flairId);
  if (input.flairText) form.set("flair_text", input.flairText);

  if (input.kind === "self") {
    form.set("text", input.text || "");
  } else {
    form.set("url", url);
  }
  if (input.kind === "video" && videoPosterUrl) {
    form.set("video_poster_url", videoPosterUrl);
  }

  const data = await redditFetch(creds, "/api/submit", { method: "POST", form });
  const err = extractJsonErrors(data);
  if (err) throw new RedditApiError(err, undefined, data);

  const payload = (
    data as {
      json?: {
        data?: { url?: string; id?: string; name?: string; websocket_url?: string };
      };
    }
  )?.json?.data;

  // Native media posts often return websocket_url while processing; URL may be empty yet.
  let postUrl = payload?.url || null;
  if (!postUrl && payload?.id) {
    postUrl = `https://www.reddit.com/comments/${payload.id}`;
  }
  return {
    url: postUrl,
    id: payload?.id || null,
    name: payload?.name || null,
  };
}

export async function downloadSiteVideoMedia(video: {
  id: string;
  siteId: string;
  s3VideoKey?: string | null;
  s3ThumbKey?: string | null;
}): Promise<{
  video: { bytes: Buffer; filename: string; contentType: string };
  poster: { bytes: Buffer; filename: string; contentType: string };
}> {
  const { existsSync, readFileSync } = await import("fs");
  const { join } = await import("path");
  const downloadsDir = join(process.cwd(), "downloads");

  async function readS3(key: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    if (!isS3Configured()) return null;
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      if (!obj.Body) return null;
      return {
        bytes: Buffer.from(await obj.Body.transformToByteArray()),
        contentType: obj.ContentType || "application/octet-stream",
      };
    } catch {
      return null;
    }
  }

  function readLocal(names: string[]): Buffer | null {
    for (const name of names) {
      const path = join(downloadsDir, video.id, name);
      if (existsSync(path)) return readFileSync(path);
    }
    return null;
  }

  const videoKey = video.s3VideoKey || s3Keys.video(video.siteId, video.id);
  const thumbKey = video.s3ThumbKey || s3Keys.thumb(video.siteId, video.id);

  const [s3Video, s3Thumb] = await Promise.all([readS3(videoKey), readS3(thumbKey)]);
  const videoBytes = s3Video?.bytes || readLocal(["video.mp4", "preview.mp4"]);
  const thumbBytes = s3Thumb?.bytes || readLocal(["thumbnail.jpg", "thumb.jpg"]);

  if (!videoBytes?.length) {
    throw new RedditApiError("Video file missing in storage");
  }
  if (!thumbBytes?.length) {
    throw new RedditApiError("Thumbnail missing — Reddit video posts require a poster image");
  }

  const maxBytes = 250 * 1024 * 1024;
  if (videoBytes.length > maxBytes) {
    throw new RedditApiError(
      `Video is too large for Reddit upload (${Math.round(videoBytes.length / 1e6)}MB; max 250MB). Use a shorter clip or post as a link to the site page.`
    );
  }

  return {
    video: {
      bytes: videoBytes,
      filename: `${video.id}.mp4`,
      contentType: s3Video?.contentType || "video/mp4",
    },
    poster: {
      bytes: thumbBytes,
      filename: `${video.id}.jpg`,
      contentType: s3Thumb?.contentType || "image/jpeg",
    },
  };
}

export { RedditApiError };
