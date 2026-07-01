import { ensureDefaultContextExists } from "@/lib/context-store";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    const g = await guardAdmin();
    if (g instanceof NextResponse) return g;
    try {
    await ensureDefaultContextExists();
    const skills = await prisma.agentSkill.findMany({
      orderBy: [{ title: "asc" }, { key: "asc" }],
    });
    return Response.json({ skills });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to load skills" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(req: Request) {
    const g = await guardAdmin();
    if (g instanceof NextResponse) return g;
    try {
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

    const created = await prisma.agentSkill.create({
      data: { key, title, content },
    });
    return Response.json({ ok: true, skill: created });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "P2002") {
      return new Response(
        JSON.stringify({ error: "Skill key must be unique." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: err.message || "Failed to create skill" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
