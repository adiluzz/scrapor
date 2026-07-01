import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    const g = await guardAdmin();
    if (g instanceof NextResponse) return g;
    try {
    const scripts = await prisma.agentScript.findMany({
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    });
    return Response.json({ scripts });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to load scripts" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(req: Request) {
    const g = await guardAdmin();
    if (g instanceof NextResponse) return g;
    try {
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
    const created = await prisma.agentScript.create({
      data: { name, description, content },
    });
    return Response.json({ ok: true, script: created });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "P2002") {
      return new Response(
        JSON.stringify({ error: "Script name must be unique." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: err.message || "Failed to create script" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}
