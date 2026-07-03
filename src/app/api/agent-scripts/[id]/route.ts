import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guardAdmin(req);
  if (g instanceof NextResponse) return g;
  try {
    const { id: idParam } = await params;
    const id = String(idParam || "").trim();
    if (!id) throw new Error("Script id is required.");

    const body = (await req.json()) as Partial<{
      name: string;
      description: string;
      content: string;
    }>;
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const content = String(body.content || "");
    if (!name) throw new Error("Script name is required.");
    if (!description) throw new Error("Script description is required.");
    if (!content.trim()) throw new Error("Script content is required.");

    const updated = await prisma.agentScript.update({
      where: { id },
      data: { name, description, content },
    });
    return Response.json({ ok: true, script: updated });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "P2002") {
      return new Response(
        JSON.stringify({ error: "Script name must be unique." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: err.message || "Failed to update script" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}