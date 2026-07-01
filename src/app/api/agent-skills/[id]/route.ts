import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  try {
    const { id: idParam } = await params;
    const id = String(idParam || "").trim();
    if (!id) throw new Error("Skill id is required.");
    const body = (await req.json()) as Partial<{
      key: string;
      title: string;
      content: string;
    }>;
    const key = String(body.key || "").trim().toLowerCase();
    const title = String(body.title || "").trim();
    const content = String(body.content || "");
    if (!key) throw new Error("Skill key is required.");
    if (!title) throw new Error("Skill title is required.");
    if (!content.trim()) throw new Error("Skill content is required.");

    const updated = await prisma.agentSkill.update({
      where: { id },
      data: { key, title, content },
    });
    return Response.json({ ok: true, skill: updated });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "P2002") {
      return new Response(
        JSON.stringify({ error: "Skill key must be unique." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: err.message || "Failed to update skill" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}

