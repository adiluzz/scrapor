import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

export type AssistantSettings = {
  temperature: number;
  maxSteps: number;
  numCtx: number;
  numPredict: number;
  /** The single model used for all requests (chat, tools, vision). */
  model: string;
  customSystemPrompt: string;
  activeContextId: string;
};

const SETTINGS_DIR = join(process.cwd(), "library");
const SETTINGS_FILE = join(SETTINGS_DIR, "assistant-settings.json");

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  temperature: 0,
  maxSteps: 12,
  numCtx: 8192,
  numPredict: 4096,
  model: process.env.BEDROCK_MODEL_ID || "anthropic.claude-haiku-4-5-20251001-v1:0",
  customSystemPrompt: "",
  activeContextId: "",
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function sanitize(raw: Partial<AssistantSettings> & Record<string, unknown>): AssistantSettings {
  // Migrate from old multi-model settings
  const legacyModel =
    (raw.toolModel as string) ||
    (raw.chatModel as string) ||
    (raw.visionModel as string);
  return {
    temperature: clamp(Number(raw.temperature ?? DEFAULT_ASSISTANT_SETTINGS.temperature), 0, 2),
    maxSteps: clamp(Math.round(Number(raw.maxSteps ?? DEFAULT_ASSISTANT_SETTINGS.maxSteps)), 1, 200),
    numCtx: clamp(Math.round(Number(raw.numCtx ?? DEFAULT_ASSISTANT_SETTINGS.numCtx)), 256, 32768),
    numPredict: clamp(
      Math.round(Number(raw.numPredict ?? DEFAULT_ASSISTANT_SETTINGS.numPredict)),
      32,
      4096
    ),
    model: String(raw.model || legacyModel || DEFAULT_ASSISTANT_SETTINGS.model),
    customSystemPrompt: String(raw.customSystemPrompt || ""),
    activeContextId: String(raw.activeContextId || ""),
  };
}

export async function loadAssistantSettings(): Promise<AssistantSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AssistantSettings> & Record<string, unknown>;
    return sanitize(parsed);
  } catch {
    return { ...DEFAULT_ASSISTANT_SETTINGS };
  }
}

export async function saveAssistantSettings(
  patch: Partial<AssistantSettings>
): Promise<AssistantSettings> {
  const current = await loadAssistantSettings();
  const next = sanitize({ ...current, ...patch });
  await mkdir(SETTINGS_DIR, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}
