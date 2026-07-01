import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { prisma } from "@/lib/db";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "readSkill",
  description: "Read the full instructions of a skill by its key name.",
  createTool: () =>
    tool({
      description:
        "Read the full content of a named skill. Call this whenever the active skills list mentions a skill you need to follow — read it first before taking any action related to that skill.",
      inputSchema: z.object({
        key: z
          .string()
          .describe(
            "The skill key to read, e.g. 'xnxx-scraper', 'video-scraping-pipeline'. Must match the key shown in the active skills list."
          ),
      }),
      execute: async ({ key }) => {
        try {
          const skill = await prisma.agentSkill.findUnique({
            where: { key },
            select: { key: true, title: true, content: true },
          });
          if (!skill) {
            const all = await prisma.agentSkill.findMany({
              select: { key: true, title: true },
              orderBy: { key: "asc" },
            });
            return JSON.stringify({
              ok: false,
              error: `Skill "${key}" not found.`,
              availableSkills: all.map((s) => `${s.key} — ${s.title}`),
            });
          }
          return JSON.stringify({
            ok: true,
            key: skill.key,
            title: skill.title,
            content: skill.content,
          });
        } catch (e) {
          return JSON.stringify({ ok: false, error: (e as Error).message });
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
