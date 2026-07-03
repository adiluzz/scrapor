import { loadAssistantSettings } from "@/lib/assistant-settings";
import { createFilteredAssistantTools } from "@/lib/assistant-tools/registry";
import { getBedrockProvider, resolveBedrockModelId } from "@/lib/bedrock";
import { guardAdmin } from "@/lib/admin-guard";
import { buildContextSelections } from "@/lib/context-store";
import { isLikelyVisionModel } from "@/lib/model-capabilities";
import { NoSuchToolError, stepCountIs, streamText } from "ai";
import { NextResponse } from "next/server";

/** No practical server-side timeout — keep requests alive for long agent runs. */
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

async function repairToolCallArgs(
  toolCall: { toolName: string; toolCallId: string; input: string },
  inputSchema: (tc: { toolName: string }) => PromiseLike<Record<string, unknown>>
): Promise<string | null> {
  let provided: Record<string, unknown>;
  try {
    provided = JSON.parse(toolCall.input);
  } catch {
    return null;
  }

  const schema = (await inputSchema(toolCall)) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const expected = Object.keys(schema.properties ?? {});
  if (expected.length === 0) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[_-]/g, "");
  const repaired: Record<string, unknown> = { ...provided };
  const providedKeys = Object.keys(provided);
  for (const exp of expected) {
    if (exp in repaired) continue;
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
  return repairedStr !== toolCall.input ? repairedStr : null;
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
          { type: "text"; text: string } | { type: "image"; image: string; mediaType?: string }
        > = [];
        const attachments = m.experimental_attachments || [];

        if (typeof m.content === "string" && m.content.trim()) {
          contentParts.push({ type: "text", text: m.content });
        }
        for (const p of parts) {
          if (p.type === "text" && p.text) contentParts.push({ type: "text", text: p.text });
          else if (includeImages && p.type === "file" && p.url && p.mediaType?.startsWith("image/"))
            contentParts.push({ type: "image", image: p.url, mediaType: p.mediaType });
        }
        for (const a of attachments) {
          if (includeImages && a?.url && a?.contentType?.startsWith("image/")) {
            contentParts.push({ type: "image", image: a.url, mediaType: a.contentType });
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
  const g = await guardAdmin(req);
  if (g instanceof NextResponse) return g;

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

    const modelId = resolveBedrockModelId(settings.model);
    const activeContextId = requestedContextId ?? settings.activeContextId;
    const basePrompt = settings.customSystemPrompt.trim() || SYSTEM_PROMPT;

    const { systemPrompt, activeToolKeys } = await buildContextSelections(
      basePrompt,
      activeContextId
    );

    const modelHasVision = isLikelyVisionModel(modelId);
    const hasImages = hasImageAttachments(typedMessages);

    const tools = createFilteredAssistantTools(
      { runtimeModelHasVision: modelHasVision },
      activeToolKeys
    );
    const hasTools = Object.keys(tools).length > 0;

    console.info("[assistant] request config", {
      modelId,
      region: process.env.AWS_REGION || "us-east-1",
      activeContextId,
      toolCount: Object.keys(tools).length,
      modelHasVision,
      hasImages,
      maxSteps: settings.maxSteps,
    });

    const bedrock = getBedrockProvider();
    const result = streamText({
      model: bedrock(modelId),
      maxOutputTokens: settings.numPredict,
      temperature: settings.temperature,
      system: systemPrompt,
      messages: toCoreMessages(typedMessages, { includeImages: modelHasVision && hasImages }),
      stopWhen: stepCountIs(settings.maxSteps),
      onError: (event: { error: unknown }) => {
        console.error("[assistant] streamText error:", event.error);
      },
      experimental_repairToolCall: (async ({
        toolCall,
        inputSchema,
        error,
      }: {
        toolCall: { toolName: string; toolCallId: string; input: string };
        inputSchema: (tc: { toolName: string }) => PromiseLike<Record<string, unknown>>;
        error: unknown;
      }) => {
        if (NoSuchToolError.isInstance(error)) return null;
        const repaired = await repairToolCallArgs(toolCall, inputSchema);
        return repaired !== null ? { ...toolCall, input: repaired } : null;
      }) as any,
      ...(hasTools
        ? {
            toolChoice: "auto",
            tools: tools as any,
          }
        : {}),
    });

    return result.toTextStreamResponse();
  } catch (e) {
    console.error("[assistant] Error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Assistant request failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}