import { getToolKeysForContext, listContexts } from "@/lib/context-store";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
    const g = await guardAdmin(request);
    if (g instanceof NextResponse) return g;
    try {
    const contexts = await listContexts();
    const selectedToolRows = await prisma.$queryRaw<Array<{ id: string; selectedToolKeys: string | null }>>`
      SELECT "id", "selectedToolKeys" FROM "Context"
    `;
    const selectedToolKeysByContextId = new Map(
      selectedToolRows.map((row) => [row.id, row.selectedToolKeys])
    );
    return Response.json({
      contexts: contexts.map((c) => ({
        id: c.id,
        name: c.name,
        content: c.content,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        selectedToolIds: getToolKeysForContext(
          selectedToolKeysByContextId.get(c.id) ?? c.selectedToolKeys
        ),
        selectedSkillIds: c.skills.map((s) => s.skillId),
      })),
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to load contexts" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(req: Request) {
    const g = await guardAdmin(req);
    if (g instanceof NextResponse) return g;
    try {
    const body = (await req.json()) as Partial<{
      name: string;
      content: string;
      selectedToolIds: string[];
      selectedSkillIds: string[];
    }>;
    const name = String(body.name || "").trim();
    const content = String(body.content || "");
    const selectedToolIds = Array.isArray(body.selectedToolIds) ? body.selectedToolIds : [];
    const selectedSkillIds = Array.isArray(body.selectedSkillIds) ? body.selectedSkillIds : [];
    if (!name) throw new Error("Context name is required.");
    if (!content.trim()) throw new Error("Context content is required.");

    const data: Parameters<typeof prisma.context.create>[0]["data"] = {
      name,
      content,
      ...(selectedSkillIds.length > 0
        ? { skills: { create: selectedSkillIds.map((skillId) => ({ skillId })) } }
        : {}),
    };
    const created = await prisma.context.create({ data });
    await prisma.$executeRaw`
      UPDATE "Context"
      SET "selectedToolKeys" = ${JSON.stringify(selectedToolIds.map((id) => String(id)).filter(Boolean))}
      WHERE "id" = ${created.id}
    `;
    return Response.json({ ok: true, context: created });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "P2002") {
      return new Response(
        JSON.stringify({ error: "Context name must be unique." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: err.message || "Failed to create context" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}