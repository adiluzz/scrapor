import { listAssistantTools } from "@/lib/assistant-tools/registry";
import { prisma } from "@/lib/db";
import { DEFAULT_CONTEXT_NAME, DEFAULT_XHAMSTER_CONTEXT } from "@/lib/default-context";

const DEFAULT_SKILLS: Array<{ key: string; title: string; content: string }> = [
  {
    key: "safe-multi-step-browsering",
    title: "Safe Multi-step Browsering",
    content:
      "Work iteratively: navigate, inspect screenshot, act, verify URL, and continue. Prefer short action loops and verify outcomes before the next action.",
  },
  {
    key: "web-research-citation",
    title: "Web Research and Citation",
    content:
      "For web research, gather at least two sources when possible, cross-check key claims, and include source URLs in final answers.",
  },
];

function parseSelectedToolKeys(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.map((v) => String(v)).filter(Boolean);
  } catch {
    return null;
  }
}

export function getToolKeysForContext(raw: string | null | undefined): string[] {
  const tools = listAssistantTools();
  const knownKeys = new Set(tools.map((t) => t.key));
  const selected = parseSelectedToolKeys(raw);
  if (selected == null) return tools.map((t) => t.key);
  return selected.filter((key) => knownKeys.has(key));
}

async function getSelectedToolKeysForContextId(contextId: string): Promise<string | null | undefined> {
  try {
    const rows = await prisma.$queryRaw<Array<{ selectedToolKeys: string | null }>>`
      SELECT "selectedToolKeys" FROM "Context" WHERE "id" = ${contextId} LIMIT 1
    `;
    return rows[0]?.selectedToolKeys;
  } catch {
    return undefined;
  }
}

async function backfillLegacyContextToolKeys() {
  try {
    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>("PRAGMA table_info('Context')");
    if (!columns.some((c) => c.name === "selectedToolKeys")) return;

    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('AgentTool', 'ContextTool')"
    );
    const tableNames = new Set(tables.map((t) => t.name));
    if (!tableNames.has("AgentTool") || !tableNames.has("ContextTool")) return;

    const rows = await prisma.$queryRawUnsafe<Array<{ contextId: string; toolKey: string }>>(
      `SELECT ct.contextId, at.key AS toolKey
       FROM ContextTool ct
       JOIN AgentTool at ON at.id = ct.toolId
       ORDER BY at.key ASC`
    );
    const byContext = new Map<string, string[]>();
    for (const row of rows) {
      const list = byContext.get(row.contextId) || [];
      list.push(row.toolKey);
      byContext.set(row.contextId, list);
    }

    for (const [contextId, toolKeys] of Array.from(byContext.entries())) {
      await prisma.$executeRaw`
        UPDATE "Context"
        SET "selectedToolKeys" = ${JSON.stringify(toolKeys)}
        WHERE "id" = ${contextId}
          AND "selectedToolKeys" IS NULL
      `;
    }
  } catch {
    // Legacy tool tables are optional after the file-backed tool migration.
  }
}

export async function ensureDefaultContextExists() {
  await prisma.$transaction(async (tx) => {
    for (const skill of DEFAULT_SKILLS) {
      await tx.agentSkill.upsert({
        where: { key: skill.key },
        update: {},
        create: skill,
      });
    }
  });
  await backfillLegacyContextToolKeys();

  const count = await prisma.context.count();
  if (count > 0) {
    const first = await prisma.context.findFirst({
      orderBy: { createdAt: "asc" },
      include: { skills: true },
    });
    if (first) {
      const allSkills = await prisma.agentSkill.findMany({ select: { id: true } });
      if (first.skills.length === 0 && allSkills.length > 0) {
        for (const s of allSkills) {
          await prisma.contextSkill.upsert({
            where: { contextId_skillId: { contextId: first.id, skillId: s.id } },
            update: {},
            create: { contextId: first.id, skillId: s.id },
          });
        }
      }
    }
    return;
  }

  const allSkills = await prisma.agentSkill.findMany({ select: { id: true } });

  const created = await prisma.context.create({
    data: {
      name: DEFAULT_CONTEXT_NAME,
      content: DEFAULT_XHAMSTER_CONTEXT,
      skills: {
        create: allSkills.map((s) => ({ skillId: s.id })),
      },
    },
  });
  await prisma.$executeRaw`
    UPDATE "Context"
    SET "selectedToolKeys" = ${JSON.stringify(listAssistantTools().map((t) => t.key))}
    WHERE "id" = ${created.id}
  `;
}

export async function listContexts() {
  await ensureDefaultContextExists();
  return prisma.context.findMany({
    include: {
      skills: { include: { skill: true } },
    },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });
}

export type ContextSelections = {
  /** The fully assembled system prompt. */
  systemPrompt: string;
  /** The set of tool keys to activate for this context (empty = no context / all keys). */
  activeToolKeys: Set<string>;
};

export async function buildContextSelections(
  basePrompt: string,
  activeContextId: string
): Promise<ContextSelections> {
  const allToolKeys = new Set(listAssistantTools().map((t) => t.key));
  const contextId = String(activeContextId || "").trim();
  if (!contextId) {
    return { systemPrompt: basePrompt, activeToolKeys: allToolKeys };
  }

  const context = await prisma.context.findUnique({
    where: { id: contextId },
    include: { skills: { include: { skill: true } } },
  });
  if (!context) {
    return { systemPrompt: basePrompt, activeToolKeys: allToolKeys };
  }

  const contextContent = context.content.trim();
  const selectedToolKeysRaw =
    (await getSelectedToolKeysForContextId(contextId)) ?? context.selectedToolKeys;
  const activeToolKeys = new Set(getToolKeysForContext(selectedToolKeysRaw));

  const toolLines = listAssistantTools()
    .filter((t) => activeToolKeys.has(t.key))
    .map((t) => `- ${t.key}: ${t.description}`)
    .join("\n");

  const renderedSkills = context.skills
    .map((s) => {
      const content = (s.skill.content || "").trim();
      if (!content) return "";
      // Extract the DESCRIPTION: line if present; otherwise use the first non-empty line (up to 160 chars).
      const descMatch = content.match(/^DESCRIPTION:\s*(.+)/m);
      const shortDesc = descMatch
        ? descMatch[1].trim()
        : (content.split("\n").find((l) => l.trim()) ?? s.skill.title).slice(0, 160);
      return `- ${s.skill.key} (${s.skill.title}): ${shortDesc}`;
    })
    .filter(Boolean);
  const skillLines =
    renderedSkills.length > 0
      ? `Available skills (call readSkill with a skill key only when you specifically need its instructions — do NOT call it for every skill before starting):\n${renderedSkills.join("\n")}`
      : "";

  const sections: string[] = [basePrompt];
  if (contextContent) sections.push(contextContent);
  if (toolLines) sections.push(`Available tools:\n${toolLines}`);
  if (skillLines) sections.push(skillLines);

  return { systemPrompt: sections.join("\n\n"), activeToolKeys };
}

/** @deprecated Use buildContextSelections instead */
export async function buildContextPromptWithSelections(
  basePrompt: string,
  activeContextId: string
): Promise<string> {
  const { systemPrompt } = await buildContextSelections(basePrompt, activeContextId);
  return systemPrompt;
}
