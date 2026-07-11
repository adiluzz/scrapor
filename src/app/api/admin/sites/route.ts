import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { invalidateSiteCache } from "@/lib/site";

export async function GET(request: Request) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;

  const sites = await prisma.site.findMany({
    orderBy: [{ networkOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ sites });
}

const createSchema = z.object({
  domain: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  kind: z.enum(["TUBE", "STUDIO"]).default("TUBE"),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  tagline: z.string().max(500).nullable().optional(),
  logoPath: z.string().max(500).nullable().optional(),
  logoKey: z.string().max(80).nullable().optional(),
  primaryColor: z.string().max(32).optional(),
  isNetworkMember: z.boolean().optional(),
  mailFromName: z.string().max(120).nullable().optional(),
  networkOrder: z.number().int().optional(),
});

export async function POST(request: Request) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const domain = d.domain.toLowerCase().trim();
  const slug = d.slug.toLowerCase().trim();

  const clash = await prisma.site.findFirst({
    where: { OR: [{ domain }, { slug }] },
  });
  if (clash) {
    return NextResponse.json(
      { error: clash.domain === domain ? "Domain already exists" : "Slug already exists" },
      { status: 409 }
    );
  }

  const site = await prisma.site.create({
    data: {
      domain,
      name: d.name.trim(),
      kind: d.kind,
      slug,
      tagline: d.tagline ?? null,
      logoPath: d.logoPath ?? null,
      logoKey: d.logoKey ?? null,
      primaryColor: d.primaryColor ?? "#D4AF37",
      isNetworkMember: d.isNetworkMember ?? true,
      mailFromName: d.mailFromName ?? d.name.trim(),
      networkOrder: d.networkOrder ?? 0,
    },
  });

  invalidateSiteCache();
  return NextResponse.json({ ok: true, site });
}
