import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardCreator, isSessionAuth } from "@/lib/admin-guard";

/** Site-scoped pornstar names for the creator upload picker. */
export async function GET(request: Request) {
  const auth = await guardCreator(request, "GET");
  if (auth instanceof NextResponse) return auth;
  if (!isSessionAuth(auth)) {
    return NextResponse.json({ error: "Creator session required" }, { status: 403 });
  }

  const creator = await prisma.creatorProfile.findUnique({ where: { userId: auth.userId } });
  if (!creator) return NextResponse.json({ error: "No creator profile" }, { status: 400 });

  const pornstars = await prisma.pornstar.findMany({
    where: { siteId: creator.siteId },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  const seen = new Set<string>();
  const names = pornstars
    .map((p) => p.name)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return NextResponse.json({ pornstars: names });
}
