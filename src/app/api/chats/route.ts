import { searchChatThreads, syncChatThread } from "@/lib/chat-store";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const g = await guardAdmin(req);
  if (g instanceof NextResponse) return g;
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("query") || "";
    const threads = await searchChatThreads(query);
    return Response.json({ threads });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to list chats" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(req: Request) {
  const g = await guardAdmin(req);
  if (g instanceof NextResponse) return g;
  try {
    const body = (await req.json()) as Partial<{
      threadId: string;
      title: string;
      messages: unknown[];
    }>;
    const threadId = String(body.threadId || "").trim();
    const title = String(body.title || "").trim();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    if (!threadId) throw new Error("threadId is required.");
    if (!title) throw new Error("title is required.");
    await syncChatThread(threadId, title, messages as never[]);

    return Response.json({ ok: true });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to sync chat" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}