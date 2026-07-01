import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const run = await prisma.scrapeRun.findFirst({
    where: { id, siteId: g.siteId },
    include: {
      siteResults: { orderBy: { sourceSite: "asc" } },
      videos: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ run });
}
