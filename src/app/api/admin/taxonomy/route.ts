import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const [tags, pornstars] = await Promise.all([
    prisma.tag.findMany({
      where: { siteId: auth.siteId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, icon: true },
    }),
    prisma.pornstar.findMany({
      where: { siteId: auth.siteId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  return NextResponse.json({ tags, pornstars });
}
