import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { isAbsolute, join, runProcess } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "runPythonScript",
  description: "Run a Python script file with args and timeout.",
  createTool: () =>
    tool({
      description: "Run a Python script file with optional args and return stdout/stderr.",
      inputSchema: z.object({
        scriptPath: z.string(),
        args: z.array(z.string()).optional(),
        pythonExecutable: z.string().optional(),
        timeoutSeconds: z.number().min(1).max(86400).optional(),
        workingDirectory: z.string().optional(),
      }),
      execute: async ({
        scriptPath,
        args,
        pythonExecutable,
        timeoutSeconds,
        workingDirectory,
      }) => {
        try {
          const python = pythonExecutable || "python3";
          const script = isAbsolute(scriptPath) ? scriptPath : join(process.cwd(), scriptPath);
          const cwd = workingDirectory
            ? (isAbsolute(workingDirectory) ? workingDirectory : join(process.cwd(), workingDirectory))
            : process.cwd();
          const runArgs = [script, ...(args || [])];
          const result = await runProcess(python, runArgs, { cwd, timeoutSeconds });
          return JSON.stringify({
            ok: result.exitCode === 0,
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
            error: (e as Error).message || "runPythonScript failed",
          });
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
