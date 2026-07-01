# Assistant Tools

Assistant tools are code-owned modules in `src/lib/assistant-tools/tools`.

## Adding A Tool

1. Add one file under `src/lib/assistant-tools/tools`, for example `my-tool.ts`.
2. Export a default object that satisfies `AssistantToolModule`.
3. Set a stable `key`, a clear `description`, and a `createTool(runtime)` function.
4. Do not add tool metadata to Prisma. Tool listing comes from `listAssistantTools()`.

```ts
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "myTool",
  description: "Short description shown in the tool list and context prompt.",
  createTool: () =>
    tool({
      description: "Clear LLM-facing guidance for when and how to call this tool.",
      parameters: z.object({
        input: z.string().describe("What the tool should process."),
      }),
      execute: async ({ input }) => {
        return `Processed ${input}`;
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
```

## Loading

`src/lib/assistant-tools/registry.ts` discovers every `.ts` file in `tools/`.

- `createAssistantTools(runtime)` returns the tool set passed to `streamText`.
- `listAssistantTools()` returns `{ id, key, description }` for UI/API usage.

Descriptions must live in the tool file so the implementation and interface stay together.
