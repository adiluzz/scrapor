import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { slugify } from "@/lib/slug";

export async function GET() {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  const creators = await prisma.creatorProfile.findMany({
    where: { siteId: g.siteId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true } }, _count: { select: { videos: true } } },
  });
  return NextResponse.json({ creators });
}

const createSchema = z.object({
  userEmail: z.string().email(),
  displayName: z.string().min(2).max(60),
  slug: z.string().optional(),
  bio: z.string().max(2000).optional(),
});

/** Create a creator profile directly for an existing user (admin power tool). */
export async function POST(request: Request) {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { siteId_email: { siteId: g.siteId, email: parsed.data.userEmail.toLowerCase() } },
  });
  if (!user) return NextResponse.json({ error: "User not found on this site" }, { status: 404 });

  const creator = await prisma.creatorProfile.create({
    data: {
      userId: user.id,
      siteId: g.siteId,
      displayName: parsed.data.displayName,
      slug: slugify(parsed.data.slug || parsed.data.displayName),
      bio: parsed.data.bio || null,
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { role: "CREATOR" } });
  return NextResponse.json({ ok: true, id: creator.id });
}
