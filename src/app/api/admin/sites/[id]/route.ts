import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { invalidateSiteCache } from "@/lib/site";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(_request, "GET");
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ site });
}

const patchSchema = z.object({
  domain: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(120).optional(),
  kind: z.enum(["TUBE", "STUDIO"]).optional(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens")
    .optional(),
  tagline: z.string().max(500).nullable().optional(),
  logoPath: z.string().max(500).nullable().optional(),
  logoKey: z.string().max(80).nullable().optional(),
  primaryColor: z.string().max(32).optional(),
  isNetworkMember: z.boolean().optional(),
  mailFromName: z.string().max(120).nullable().optional(),
  networkOrder: z.number().int().optional(),
  seoTitle: z.string().max(300).nullable().optional(),
  seoDescription: z.string().max(2000).nullable().optional(),
  seoKeywords: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  ogImagePath: z.string().max(500).nullable().optional(),
  exoSiteVerification: z.string().max(200).nullable().optional(),
  homeH1: z.string().max(300).nullable().optional(),
  homeIntroHtml: z.string().max(20000).nullable().optional(),
  vastTagUrl: z.string().max(2000).nullable().optional(),
  adSkipSeconds: z.number().int().min(0).max(120).optional(),
  adMinViewSeconds: z.number().int().min(0).max(120).optional(),
  adTimeoutMs: z.number().int().min(0).max(120000).optional(),
  exoInsClass: z.string().max(120).nullable().optional(),
  exoZoneHome: z.string().max(120).nullable().optional(),
  exoZoneUnderPlayer: z.string().max(120).nullable().optional(),
  exoZoneVideoFullscreen: z.string().max(120).nullable().optional(),
});

function serializeSeoKeywords(value: string | string[] | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return JSON.stringify(value.map((k) => String(k).trim()).filter(Boolean));
  return value;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const existing = await prisma.site.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  if (d.domain !== undefined || d.slug !== undefined) {
    const domain = d.domain?.toLowerCase().trim();
    const slug = d.slug?.toLowerCase().trim();
    const clash = await prisma.site.findFirst({
      where: {
        id: { not: id },
        OR: [
          ...(domain ? [{ domain }] : []),
          ...(slug ? [{ slug }] : []),
        ],
      },
    });
    if (clash) {
      return NextResponse.json(
        {
          error:
            domain && clash.domain === domain
              ? "Domain already exists"
              : "Slug already exists",
        },
        { status: 409 }
      );
    }
  }

  const site = await prisma.site.update({
    where: { id },
    data: {
      domain: d.domain?.toLowerCase().trim(),
      name: d.name?.trim(),
      kind: d.kind,
      slug: d.slug?.toLowerCase().trim(),
      tagline: d.tagline === undefined ? undefined : d.tagline,
      logoPath: d.logoPath === undefined ? undefined : d.logoPath,
      logoKey: d.logoKey === undefined ? undefined : d.logoKey,
      primaryColor: d.primaryColor,
      isNetworkMember: d.isNetworkMember,
      mailFromName: d.mailFromName === undefined ? undefined : d.mailFromName,
      networkOrder: d.networkOrder,
      seoTitle: d.seoTitle === undefined ? undefined : d.seoTitle,
      seoDescription: d.seoDescription === undefined ? undefined : d.seoDescription,
      seoKeywords: serializeSeoKeywords(d.seoKeywords),
      ogImagePath: d.ogImagePath === undefined ? undefined : d.ogImagePath,
      exoSiteVerification: d.exoSiteVerification === undefined ? undefined : d.exoSiteVerification,
      homeH1: d.homeH1 === undefined ? undefined : d.homeH1,
      homeIntroHtml: d.homeIntroHtml === undefined ? undefined : d.homeIntroHtml,
      vastTagUrl: d.vastTagUrl === undefined ? undefined : d.vastTagUrl,
      adSkipSeconds: d.adSkipSeconds,
      adMinViewSeconds: d.adMinViewSeconds,
      adTimeoutMs: d.adTimeoutMs,
      exoInsClass: d.exoInsClass === undefined ? undefined : d.exoInsClass,
      exoZoneHome: d.exoZoneHome === undefined ? undefined : d.exoZoneHome,
      exoZoneUnderPlayer: d.exoZoneUnderPlayer === undefined ? undefined : d.exoZoneUnderPlayer,
      exoZoneVideoFullscreen:
        d.exoZoneVideoFullscreen === undefined ? undefined : d.exoZoneVideoFullscreen,
    },
  });

  invalidateSiteCache();
  return NextResponse.json({ ok: true, site });
}
