const baseURL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api").replace(/\/$/, "");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { model?: string };
    const model = String(body?.model || "").trim();
    if (!model) {
      return new Response(JSON.stringify({ error: "Missing model name" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let delRes = await fetch(`${baseURL}/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    // Compatibility fallback for servers expecting POST.
    if (delRes.status === 405) {
      delRes = await fetch(`${baseURL}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
    }
    const text = await delRes.text();
    if (!delRes.ok) {
      let message = text || "Delete failed";
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed?.error) message = parsed.error;
      } catch {
        // keep raw text
      }
      return new Response(JSON.stringify({ error: message }), {
        status: delRes.status,
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
    return new Response(JSON.stringify({ error: (e as Error).message || "Delete failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

