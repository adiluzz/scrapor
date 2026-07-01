import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

const baseURL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api").replace(/\/$/, "");

export async function POST(req: Request) {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  try {
    const body = (await req.json()) as { model?: string };
    const model = String(body?.model || "").trim();
    if (!model) {
      return new Response(JSON.stringify({ error: "Missing model name" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pullRes = await fetch(`${baseURL}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: false }),
    });
    const text = await pullRes.text();
    if (!pullRes.ok) {
      let message = text || "Pull failed";
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed?.error) message = parsed.error;
      } catch {
        // keep raw text
      }
      return new Response(JSON.stringify({ error: message }), {
        status: pullRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }
    return Response.json({ ok: true, result: payload });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Pull failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

