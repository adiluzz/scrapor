import { getChatThread } from "@/lib/chat-store";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  try {
    const { id: idParam } = await params;
    const id = String(idParam || "").trim();
    if (!id) throw new Error("Chat id is required.");
    const thread = await getChatThread(id);
    if (!thread) {
      return new Response(JSON.stringify({ error: "Chat not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const messages = thread.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      experimental_attachments: m.attachments.map((a) => ({
        url: a.url,
        contentType: a.contentType || undefined,
        name: a.name || undefined,
      })),
    }));
    return Response.json({
      thread: {
        id: thread.id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        createdAt: thread.createdAt,
      },
      messages,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to load chat" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
