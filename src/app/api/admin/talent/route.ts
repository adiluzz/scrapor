import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { serializeAdminTalent } from "@/lib/studio-talent-admin";
import {
  serializeTalentLanguages,
  slugifyTalentName,
  toDbRegion,
} from "@/lib/studio-talent";

const createSchema = z.object({
  siteId: z.string().min(1),
  name: z.string().min(1).max(120),
  slug: z.string().max(80).optional(),
});

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const talents = await prisma.studioTalent.findMany({
    include: {
      media: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      site: { select: { id: true, name: true, domain: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    talents: talents.map(serializeAdminTalent),
  });
}

export async function POST(request: Request) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const body = createSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Name and studio site are required" }, { status: 400 });
  }

  const site = await prisma.site.findUnique({
    where: { id: body.data.siteId },
    select: { id: true, kind: true },
  });
  if (!site || site.kind !== "STUDIO") {
    return NextResponse.json({ error: "Pick a studio website" }, { status: 400 });
  }

  const slug = slugifyTalentName(body.data.slug || body.data.name);
  if (!slug) {
    return NextResponse.json({ error: "Could not build a slug from that name" }, { status: 400 });
  }

  const exists = await prisma.studioTalent.findUnique({
    where: { siteId_slug: { siteId: site.id, slug } },
    select: { id: true },
  });
  if (exists) {
    return NextResponse.json({ error: "A talent with that slug already exists" }, { status: 409 });
  }

  const last = await prisma.studioTalent.findFirst({
    where: { siteId: site.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const talent = await prisma.studioTalent.create({
    data: {
      siteId: site.id,
      name: body.data.name.trim(),
      slug,
      region: toDbRegion("international"),
      languages: serializeTalentLanguages([]),
      sortOrder: (last?.sortOrder ?? -10) + 10,
    },
    include: {
      media: true,
      site: { select: { id: true, name: true, domain: true } },
    },
  });

  return NextResponse.json({ talent: serializeAdminTalent(talent) }, { status: 201 });
}
