import type {
  AssistantToolDefinition,
  AssistantToolModule,
  AssistantToolRuntime,
  AssistantToolSet,
} from "@/lib/assistant-tools/types";
import addVideo from "@/lib/assistant-tools/tools/add-video";
import clickAt from "@/lib/assistant-tools/tools/click-at";
import downloadVideoFile from "@/lib/assistant-tools/tools/download-video-file";
import saveVideoRecord from "@/lib/assistant-tools/tools/save-video-record";
import click from "@/lib/assistant-tools/tools/click";
import crawlPage from "@/lib/assistant-tools/tools/crawl-page";
import createThumbnailVideo from "@/lib/assistant-tools/tools/create-thumbnail-video";
import downloadAndSaveVideo from "@/lib/assistant-tools/tools/download-and-save-video";
import evaluateJS from "@/lib/assistant-tools/tools/evaluate-js";
import fetchWebPage from "@/lib/assistant-tools/tools/fetch-web-page";
import findElement from "@/lib/assistant-tools/tools/find-element";
import getVideoInfo from "@/lib/assistant-tools/tools/get-video-info";
import installPythonPackages from "@/lib/assistant-tools/tools/install-python-packages";
import navigate from "@/lib/assistant-tools/tools/navigate";
import press from "@/lib/assistant-tools/tools/press";
import readLessons from "@/lib/assistant-tools/tools/read-lessons";
import recordVideo from "@/lib/assistant-tools/tools/record-video";
import returnImage from "@/lib/assistant-tools/tools/return-image";
import runPythonCode from "@/lib/assistant-tools/tools/run-python-code";
import runPythonScript from "@/lib/assistant-tools/tools/run-python-script";
import screenshot from "@/lib/assistant-tools/tools/screenshot";
import startCleanRecordingSession from "@/lib/assistant-tools/tools/start-clean-recording-session";
import trimVideo from "@/lib/assistant-tools/tools/trim-video";
import wait from "@/lib/assistant-tools/tools/wait";
import webSearch from "@/lib/assistant-tools/tools/web-search";
import writeLesson from "@/lib/assistant-tools/tools/write-lesson";

/**
 * Wraps an AI SDK tool so that any exception thrown by `execute` is caught and
 * returned as a JSON error string instead of propagating up and breaking the
 * stream.  The LLM receives the error message as a normal tool result and can
 * read it, diagnose the cause, and retry with corrected arguments.
 */
function wrapToolWithErrorHandling(sdkTool: unknown): unknown {
  const t = sdkTool as { execute?: (...args: unknown[]) => Promise<unknown>; [key: string]: unknown };
  if (typeof t?.execute !== "function") return sdkTool;
  const originalExecute = t.execute;
  return {
    ...t,
    execute: async (...args: unknown[]) => {
      try {
        return await originalExecute(...args);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : undefined;
        console.error("[tool-error]", { message, stack });
        return JSON.stringify({ ok: false, error: message, ...(stack ? { stack } : {}) });
      }
    },
  };
}

type ToolModuleContext = {
  keys: () => string[];
  <T>(id: string): T;
};

type WebpackRequire = NodeRequire & {
  context: (path: string, recursive: boolean, match: RegExp) => ToolModuleContext;
};

declare const require: WebpackRequire;

// Webpack expands this context to every tool module in the tools directory.
const toolModuleContext = require.context("./tools", false, /\.ts$/);
const builtInToolModules: AssistantToolModule[] = [
  addVideo,
  click,
  clickAt,
  crawlPage,
  createThumbnailVideo,
  downloadAndSaveVideo,
  downloadVideoFile,
  evaluateJS,
  fetchWebPage,
  findElement,
  getVideoInfo,
  installPythonPackages,
  navigate,
  press,
  readLessons,
  recordVideo,
  returnImage,
  runPythonCode,
  runPythonScript,
  saveVideoRecord,
  screenshot,
  startCleanRecordingSession,
  trimVideo,
  wait,
  webSearch,
  writeLesson,
];

function loadAssistantToolModules(): AssistantToolModule[] {
  const discoveredToolModules = toolModuleContext
    .keys()
    .map((modulePath) => {
      const loaded = toolModuleContext<{ default?: AssistantToolModule; assistantTool?: AssistantToolModule }>(modulePath);
      return loaded.default || loaded.assistantTool;
    })
    .filter((toolModule): toolModule is AssistantToolModule => {
      return !!toolModule?.key && !!toolModule.description && typeof toolModule.createTool === "function";
    });

  return Array.from(
    new Map(
      [...builtInToolModules, ...discoveredToolModules].map((toolModule) => [
        toolModule.key,
        toolModule,
      ])
    ).values()
  )
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function listAssistantTools(): AssistantToolDefinition[] {
  return loadAssistantToolModules().map((toolModule) => ({
    id: toolModule.key,
    key: toolModule.key,
    description: toolModule.description,
  }));
}

export function createAssistantTools(runtime: AssistantToolRuntime): AssistantToolSet {
  return Object.fromEntries(
    loadAssistantToolModules().map((toolModule) => [
      toolModule.key,
      wrapToolWithErrorHandling(toolModule.createTool(runtime)),
    ])
  );
}

/** Like createAssistantTools but only includes the tools whose keys are in the provided set. */
export function createFilteredAssistantTools(
  runtime: AssistantToolRuntime,
  allowedKeys: Set<string>
): AssistantToolSet {
  return Object.fromEntries(
    loadAssistantToolModules()
      .filter((toolModule) => allowedKeys.has(toolModule.key))
      .map((toolModule) => [toolModule.key, wrapToolWithErrorHandling(toolModule.createTool(runtime))])
  );
}
