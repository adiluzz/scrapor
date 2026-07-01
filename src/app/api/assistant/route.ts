import { loadAssistantSettings } from "@/lib/assistant-settings";
import { createFilteredAssistantTools } from "@/lib/assistant-tools/registry";
import { buildContextSelections } from "@/lib/context-store";
import { isLikelyVisionModel } from "@/lib/model-capabilities";
import { createOpenAI } from "@ai-sdk/openai";
import { InvalidToolArgumentsError, NoSuchToolError, streamText } from "ai";
import http from "node:http";
import https from "node:https";

// Ollama can take a very long time to load a model and start streaming.
// The global fetch (undici) has a 300 s headersTimeout that kills slow responses.
// This custom fetch uses Node's http/https directly — no timeout at all.
const ollamaFetch: typeof globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
  );
  const isHttps = url.protocol === "https:";

  // Normalise HeadersInit → plain Record so Node's http.request accepts it.
  // Casting `init?.headers as Record` silently drops a Headers instance, which
  // is what the AI SDK passes — causing Content-Type to never reach Ollama.
  const rawHeaders: Record<string, string> = {};
  const hi = init?.headers;
  if (hi) {
    if (hi instanceof Headers) {
      hi.forEach((v, k) => { rawHeaders[k] = v; });
    } else if (Array.isArray(hi)) {
      for (const [k, v] of hi) rawHeaders[k] = v;
    } else {
      Object.assign(rawHeaders, hi);
    }
  }

  return new Promise<Response>((resolve, reject) => {
    const req = (isHttps ? https : http).request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: init?.method ?? "GET",
        headers: rawHeaders,
      },
      (res) => {
        const stream = new ReadableStream({
          start(controller) {
            res.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
            res.on("end", () => controller.close());
            res.on("error", (err) => controller.error(err));
          },
        });
        // Strip hop-by-hop headers that Node already handled; passing
        // transfer-encoding:chunked to the Response constructor confuses parsers.
        const responseHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (k === "transfer-encoding" || k === "connection") continue;
          responseHeaders[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
        }
        resolve(new Response(stream, { status: res.statusCode ?? 200, headers: responseHeaders }));
      }
    );
    req.on("error", reject);

    const body = init?.body;
    if (body == null) {
      req.end();
    } else if (typeof body === "string" || body instanceof Uint8Array) {
      req.write(body);
      req.end();
    } else if (body instanceof ReadableStream) {
      // AI SDK may stream the request body as a Web ReadableStream.
      const reader = (body as ReadableStream<Uint8Array>).getReader();
      const pump = (): Promise<void> =>
        reader.read().then(({ done, value }) => {
          if (done) { req.end(); return; }
          req.write(value);
          return pump();
        });
      pump().catch(reject);
    } else {
      req.end();
    }
  });
};

// Use Ollama's OpenAI-compatible endpoint — it has much better tool-calling support
// than the native Ollama API (ollama-ai-provider).
const rawBase = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api")
  .replace(/\/api\/?$/, "");
const ollama = createOpenAI({
  baseURL: `${rawBase}/v1`,
  apiKey: "ollama",
  fetch: ollamaFetch,
});

/** No practical server-side timeout — keep requests alive for days. */
export const maxDuration = 604800;

const SYSTEM_PROMPT = `You are an agentic assistant with access to tools.

CRITICAL RULES — never break these:
1. When tools are available, use them to complete tasks. Do NOT ask for permission or explain before acting.
2. NEVER ask the user to run code. You have tools — use them. Run code yourself and show the output.
3. After each tool result, either call the next tool or give a short final answer.
4. Keep calling tools until the task is fully complete.
5. If no tools apply, answer directly from knowledge.
6. ALWAYS end with a short plain-text summary of what was done, even after many tool calls. Never finish silently.
7. If a tool returns an error (ok: false, or an error message), READ the error carefully, fix the issue, and retry the tool with corrected arguments. Never give up after a single tool error.
8. If you get a parameter/argument error from a tool, check the exact parameter names required by that tool and retry with the correct names.`;

/**
 * Attempts to repair a tool call whose arguments failed Zod schema validation.
 *
 * Strategy: heuristically remap field names from the provided args to the
 * expected schema fields by comparing normalised lower-case names (stripping
 * underscores and hyphens).  If every required field can be satisfied this way
 * we return repaired args; otherwise we return null so the SDK surfaces the
 * original validation error to the model as a readable tool result.
 */
function repairToolCallArgs(
  toolCall: { toolName: string; toolCallId: string; args: string },
  parameterSchema: (tc: { toolName: string }) => Record<string, unknown>
): string | null {
  let provided: Record<string, unknown>;
  try {
    provided = JSON.parse(toolCall.args);
  } catch {
    return null;
  }

  const schema = parameterSchema(toolCall) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const expected = Object.keys(schema.properties ?? {});
  if (expected.length === 0) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[_-]/g, "");

  const repaired: Record<string, unknown> = { ...provided };

  // Remap provided keys that don't match an expected field but normalise to one
  const providedKeys = Object.keys(provided);
  for (const exp of expected) {
    if (exp in repaired) continue; // already present — no remapping needed
    const normExp = normalize(exp);
    const match = providedKeys.find(
      (k) => !(k in Object.fromEntries(expected.map((e) => [e, true]))) &&
        (normalize(k) === normExp ||
          normalize(k).includes(normExp) ||
          normExp.includes(normalize(k)))
    );
    if (match) {
      repaired[exp] = repaired[match];
      delete repaired[match];
    }
  }

  const repairedStr = JSON.stringify(repaired);
  // Only return if we actually changed something
  return repairedStr !== toolCall.args ? repairedStr : null;
}

function toCoreMessages(
  messages: Array<{
    role: string;
    content?: string;
    experimental_attachments?: Array<{ contentType?: string; url: string; name?: string }>;
    parts?: Array<{ type: string; text?: string; url?: string; mediaType?: string }>;
  }>,
  options?: { includeImages?: boolean }
) {
  const includeImages = options?.includeImages ?? true;
  return messages
    .map((m) => {
      if (m.role === "user") {
        const parts = m.parts || [];
        const contentParts: Array<
          { type: "text"; text: string } | { type: "image"; image: string; mimeType?: string }
        > = [];
        const attachments = m.experimental_attachments || [];

        if (typeof m.content === "string" && m.content.trim()) {
          contentParts.push({ type: "text", text: m.content });
        }
        for (const p of parts) {
          if (p.type === "text" && p.text) contentParts.push({ type: "text", text: p.text });
          else if (includeImages && p.type === "file" && p.url && p.mediaType?.startsWith("image/"))
            contentParts.push({ type: "image", image: p.url, mimeType: p.mediaType });
        }
        for (const a of attachments) {
          if (includeImages && a?.url && a?.contentType?.startsWith("image/")) {
            contentParts.push({ type: "image", image: a.url, mimeType: a.contentType });
          }
        }
        const content =
          contentParts.length === 1 && contentParts[0].type === "text"
            ? contentParts[0].text
            : contentParts;
        return { role: "user" as const, content };
      }
      if (m.role === "assistant") {
        const text = m.content ?? m.parts?.find((p) => p.type === "text")?.text ?? "";
        return { role: "assistant" as const, content: text };
      }
      return null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);
}

function hasImageAttachments(
  messages: Array<{
    role: string;
    content?: string;
    experimental_attachments?: Array<{ contentType?: string; url: string; name?: string }>;
    parts?: Array<{ type: string; text?: string; url?: string; mediaType?: string }>;
  }>
): boolean {
  return messages.some((m) => {
    const hasAttachmentImage = (m.experimental_attachments || []).some((a) =>
      a?.contentType?.startsWith("image/")
    );
    const hasPartsImage = (m.parts || []).some(
      (p) => p.type === "file" && !!p.url && !!p.mediaType && p.mediaType.startsWith("image/")
    );
    return hasAttachmentImage || hasPartsImage;
  });
}

export async function POST(req: Request) {
  let messages: unknown;
  let requestedContextId: string | undefined;
  try {
    const body = await req.json();
    messages = body?.messages;
    if (body && Object.prototype.hasOwnProperty.call(body, "activeContextId")) {
      requestedContextId = String(body.activeContextId || "").trim();
    }
    if (!Array.isArray(messages)) throw new Error("Missing or invalid messages array");
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const settings = await loadAssistantSettings();
    const typedMessages = messages as Array<{
      role: string;
      content?: string;
      experimental_attachments?: Array<{ contentType?: string; url: string; name?: string }>;
      parts?: Array<{ type: string; text?: string; url?: string; mediaType?: string }>;
    }>;

    const modelId = settings.model;
    const activeContextId = requestedContextId ?? settings.activeContextId;
    const basePrompt = settings.customSystemPrompt.trim() || SYSTEM_PROMPT;

    // Build system prompt + get the set of tools the context allows
    const { systemPrompt, activeToolKeys } = await buildContextSelections(
      basePrompt,
      activeContextId
    );

    const modelHasVision = isLikelyVisionModel(modelId);
    const hasImages = hasImageAttachments(typedMessages);

    // Build the filtered toolset from the context's allowed keys
    const tools = createFilteredAssistantTools(
      { runtimeModelHasVision: modelHasVision },
      activeToolKeys
    );
    const hasTools = Object.keys(tools).length > 0;

    console.info("[assistant] request config", {
      modelId,
      activeContextId,
      toolCount: Object.keys(tools).length,
      toolKeys: Object.keys(tools),
      modelHasVision,
      hasImages,
      maxSteps: settings.maxSteps,
    });
    console.info("[assistant] system prompt:\n" + systemPrompt);

    const result = streamText({
      model: ollama(modelId) as any,
      maxTokens: settings.numPredict,
      temperature: settings.temperature,
      system: systemPrompt,
      messages: toCoreMessages(typedMessages, { includeImages: modelHasVision && hasImages }),
      maxSteps: settings.maxSteps,
      ...(({
        onError: (event: { error: unknown }) => {
          console.error("[assistant] streamText error:", event.error);
        },
        experimental_repairToolCall: async ({
          toolCall,
          tools: _availableTools,
          parameterSchema,
          error,
        }: {
          toolCall: { toolName: string; toolCallId: string; args: string };
          tools: Record<string, unknown>;
          parameterSchema: (tc: { toolName: string }) => Record<string, unknown>;
          error: unknown;
        }) => {
          console.warn("[assistant] tool call repair triggered", {
            tool: toolCall.toolName,
            args: toolCall.args,
            error: error instanceof Error ? error.message : String(error),
          });

          if (NoSuchToolError.isInstance(error)) {
            // Returning null lets the SDK surface the error to the LLM as a tool result,
            // so the LLM can recover by using a correct tool name.
            console.warn("[assistant] NoSuchToolError — tool not in active context:", toolCall.toolName);
            return null;
          }

          if (InvalidToolArgumentsError.isInstance(error)) {
            const repairedArgs = repairToolCallArgs(toolCall, parameterSchema);
            if (repairedArgs !== null) {
              console.info("[assistant] repaired tool args via field remapping", {
                tool: toolCall.toolName,
                original: toolCall.args,
                repaired: repairedArgs,
              });
              return { ...toolCall, args: repairedArgs };
            }
          }

          return null;
        },
      }) as any),
      ...(hasTools
        ? {
            toolChoice: "auto",
            tools: tools as any,
          }
        : {}),
    });

    return result.toDataStreamResponse({
      getErrorMessage: (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[assistant] stream error forwarded to client:", msg);
        return msg || "Unknown streaming error";
      },
    });
  } catch (e) {
    console.error("[assistant] Error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Assistant request failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
