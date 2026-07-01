import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = String(params.id || "").trim();
    if (!id) throw new Error("Context id is required.");

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

    const updated = await prisma.$transaction(async (tx) => {
      await tx.contextSkill.deleteMany({ where: { contextId: id } });
      const data: Parameters<typeof tx.context.update>[0]["data"] = {
        name,
        content,
        ...(selectedSkillIds.length > 0
          ? { skills: { create: selectedSkillIds.map((skillId) => ({ skillId })) } }
          : {}),
      };
      const context = await tx.context.update({
        where: { id },
        data,
      });
      await tx.$executeRaw`
        UPDATE "Context"
        SET "selectedToolKeys" = ${JSON.stringify(selectedToolIds.map((id) => String(id)).filter(Boolean))}
        WHERE "id" = ${id}
      `;
      return context;
    });
    return Response.json({ ok: true, context: updated });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "P2002") {
      return new Response(
        JSON.stringify({ error: "Context name must be unique." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: err.message || "Failed to update context" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
