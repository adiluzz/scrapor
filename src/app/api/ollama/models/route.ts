import { isLikelyToolModel, isLikelyVisionModel } from "@/lib/model-capabilities";

const baseURL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api").replace(/\/$/, "");
const v1URL = baseURL.replace(/\/api$/, "") + "/v1";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Live-probe whether Ollama's OpenAI-compatible endpoint fires a tool_call for this model.
 *
 * Strategy:
 *  1. If the model name matches a known-tool-capable family, trust the heuristic immediately
 *     and skip the expensive live probe.
 *  2. For unknown models, send a lightweight probe with tool_choice "auto" and a 45 s timeout.
 *     Accept any response that contains tool_calls OR finish_reason=tool_calls.
 *
 * This fixes two common failure modes:
 *  - Cold-start: loading a 7 B model from disk takes 20-40 s, easily killing a 15 s timeout.
 *  - Strict tool_choice: some models acknowledge tools under "auto" but not "required".
 */
async function probeToolSupport(modelName: string): Promise<boolean> {
  // Fast-path: well-known tool-capable model families don't need a live probe.
  if (isLikelyToolModel(modelName)) return true;

  const probe = {
    model: modelName,
    messages: [{ role: "user", content: "call the echo tool with message='hi'" }],
    tools: [
      {
        type: "function",
        function: {
          name: "echo",
          description: "Echo a message",
          parameters: {
            type: "object",
            required: ["message"],
            properties: { message: { type: "string" } },
          },
        },
      },
    ],
    tool_choice: "auto",
    stream: false,
    options: { num_predict: 64 },
  };

  try {
    const ctrl = new AbortController();
    // 45 s: generous enough to survive a cold-start model load.
    const timeout = setTimeout(() => ctrl.abort(), 45_000);
    const res = await fetch(`${v1URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(probe),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return false;
    const json = (await res.json()) as {
      choices?: Array<{ finish_reason?: string; message?: { tool_calls?: unknown[] } }>;
    };
    const choice = json?.choices?.[0];
    return (
      choice?.finish_reason === "tool_calls" ||
      (Array.isArray(choice?.message?.tool_calls) && (choice.message?.tool_calls?.length ?? 0) > 0)
    );
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const res = await fetch(`${baseURL}/tags`, { method: "GET", cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: text || "Failed to fetch models" }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = JSON.parse(text) as {
      models?: Array<{
        name?: string;
        size?: number;
        details?: { family?: string; families?: string[] };
      }>;
    };

    // Run tool probes in parallel (capped at all installed models)
    const rawModels = data.models || [];
    const probeResults = await Promise.all(
      rawModels.map((m) => probeToolSupport(m.name || ""))
    );

    const models = rawModels.map((m, i) => ({
      name: m.name || "",
      size: m.size || 0,
      hasVision: isLikelyVisionModel(m.name || "", m.details?.families, m.details?.family),
      supportsTools: probeResults[i],
    }));

    return Response.json({ models });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to fetch models" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
