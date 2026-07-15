import { NextResponse } from "next/server";
import { getRedditIdentity, listModeratedSubreddits, listUserSubreddits } from "@/lib/reddit";
import { guardRedditRoute, redditErrorResponse } from "@/lib/reddit-admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gated = await guardRedditRoute(request, id);
  if ("error" in gated && gated.error) return gated.error;

  try {
    const [identity, moderated, subscribed] = await Promise.all([
      getRedditIdentity(gated.creds!),
      listModeratedSubreddits(gated.creds!),
      listUserSubreddits(gated.creds!),
    ]);
    return NextResponse.json({
      ok: true,
      identity,
      moderated,
      subscribed: subscribed.slice(0, 50),
    });
  } catch (err) {
    return redditErrorResponse(err);
  }
}
