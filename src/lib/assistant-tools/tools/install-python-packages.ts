import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { isAbsolute, join, runProcess } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "installPythonPackages",
  description: "Install Python packages using pip.",
  createTool: () =>
    tool({
      description: "Install Python packages with pip in the local environment.",
      parameters: z.object({
        packages: z.array(z.string().min(1)).min(1),
        upgrade: z.boolean().optional(),
        pythonExecutable: z.string().optional(),
        timeoutSeconds: z.number().min(1).max(3600).optional(),
        workingDirectory: z.string().optional(),
      }),
      execute: async ({
        packages,
        upgrade,
        pythonExecutable,
        timeoutSeconds,
        workingDirectory,
      }) => {
        try {
          const python = pythonExecutable || "python3";
          const cwd = workingDirectory
            ? (isAbsolute(workingDirectory) ? workingDirectory : join(process.cwd(), workingDirectory))
            : process.cwd();
          const args = ["-m", "pip", "install", ...(upgrade ? ["--upgrade"] : []), ...packages];
          const result = await runProcess(python, args, { cwd, timeoutSeconds });
          return JSON.stringify({
            ok: result.exitCode === 0,
            command: `${python} ${args.join(" ")}`,
            cwd,
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            stdout: result.stdout.slice(-12000),
            stderr: result.stderr.slice(-12000),
          });
        } catch (e) {
          return JSON.stringify({
            ok: false,
            error: (e as Error).message || "installPythonPackages failed",
          });
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
