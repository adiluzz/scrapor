import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { join, mkdir, runProcess } from "@/lib/assistant-tools/utils";
import { writeFile } from "fs/promises";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "runPythonCode",
  description: "Run an inline Python code snippet and return stdout/stderr.",
  createTool: () =>
    tool({
      description:
        "Run inline Python code by writing it to a temporary script and executing it. Use this when the user pastes code or asks you to run a Python snippet without an existing file path.",
      parameters: z.object({
        code: z.string().min(1).describe("Python code to execute."),
        args: z.array(z.string()).optional().describe("Optional command-line arguments passed to the script."),
        pythonExecutable: z.string().optional().describe("Python executable. Defaults to python3."),
        timeoutSeconds: z.number().min(1).max(86400).optional().describe("Maximum runtime in seconds. Defaults to 300."),
        workingDirectory: z.string().optional().describe("Directory to run the script from. Defaults to the project root."),
      }),
      execute: async ({ code, args, pythonExecutable, timeoutSeconds, workingDirectory }) => {
        try {
          const scriptsDir = join(process.cwd(), "library", "assistant-scripts");
          await mkdir(scriptsDir, { recursive: true });
          const scriptPath = join(scriptsDir, `inline-${Date.now()}.py`);
          await writeFile(scriptPath, code, "utf-8");

          const python = pythonExecutable || "python3";
          const cwd = workingDirectory || process.cwd();
          const runArgs = [scriptPath, ...(args || [])];
          const result = await runProcess(python, runArgs, { cwd, timeoutSeconds });
          return JSON.stringify({
            ok: result.exitCode === 0,
            scriptPath,
            command: `${python} ${runArgs.join(" ")}`,
            cwd,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            stdout: result.stdout.slice(-12000),
            stderr: result.stderr.slice(-12000),
          });
        } catch (e) {
          return JSON.stringify({
            ok: false,
            error: (e as Error).message || "runPythonCode failed",
          });
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
