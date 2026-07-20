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
  juicyAdsSiteVerification: z.string().max(200).nullable().optional(),
  hilltopAdsSiteVerification: z.string().max(200).nullable().optional(),
  homeH1: z.string().max(300).nullable().optional(),
  homeIntroHtml: z.string().max(20000).nullable().optional(),
  verifiedTagsIntroHtml: z.string().max(20000).nullable().optional(),
  gaMeasurementId: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .refine(
      (v) => v == null || v.trim() === "" || /^G-[A-Z0-9]+$/i.test(v.trim()),
      "Must be a GA4 id like G-XXXXXXXX"
    ),
  seoVideoTitleTpl: z.string().max(500).nullable().optional(),
  seoVideoDescTpl: z.string().max(2000).nullable().optional(),
  seoPornstarTitleTpl: z.string().max(500).nullable().optional(),
  seoPornstarDescTpl: z.string().max(2000).nullable().optional(),
  seoTagTitleTpl: z.string().max(500).nullable().optional(),
  seoTagDescTpl: z.string().max(2000).nullable().optional(),
  seoCreatorTitleTpl: z.string().max(500).nullable().optional(),
  seoCreatorDescTpl: z.string().max(2000).nullable().optional(),
  seoTagsIndexTitle: z.string().max(500).nullable().optional(),
  seoTagsIndexDesc: z.string().max(2000).nullable().optional(),
  seoPornstarsIndexTitle: z.string().max(500).nullable().optional(),
  seoPornstarsIndexDesc: z.string().max(2000).nullable().optional(),
  seoCreatorsIndexTitle: z.string().max(500).nullable().optional(),
  seoCreatorsIndexDesc: z.string().max(2000).nullable().optional(),
  vastTagUrl: z.string().max(2000).nullable().optional(),
  vastTagUrlBackup: z.string().max(2000).nullable().optional(),
  adSkipSeconds: z.number().int().min(0).max(120).optional(),
  adMinViewSeconds: z.number().int().min(0).max(120).optional(),
  adTimeoutMs: z.number().int().min(0).max(120000).optional(),
  exoInsClass: z.string().max(120).nullable().optional(),
  exoZoneHome: z.string().max(120).nullable().optional(),
  exoZoneUnderPlayer: z.string().max(120).nullable().optional(),
  exoZoneVideoFullscreen: z.string().max(120).nullable().optional(),
  exoZoneGridNative: z.string().max(120).nullable().optional(),
  exoZoneMobileSticky: z.string().max(120).nullable().optional(),
  exoZonePopunder: z.string().max(120).nullable().optional(),
  exoZoneMidList: z.string().max(120).nullable().optional(),
  juicyAdsSiteId: z.string().max(120).nullable().optional(),
  juicyAdsZoneBanner: z.string().max(120).nullable().optional(),
  juicyAdsZoneNative: z.string().max(120).nullable().optional(),
  juicyAdsZoneVidfloat: z.string().max(120).nullable().optional(),
  juicyAdsZoneInvideo: z.string().max(120).nullable().optional(),
  stripchatWidgetId: z.string().max(200).nullable().optional(),
  stripchatAffiliateUrl: z.string().max(2000).nullable().optional(),
  adsPopunderEnabled: z.boolean().optional(),
  adsJuicyEnabled: z.boolean().optional(),
  adsCamWidgetEnabled: z.boolean().optional(),
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
      juicyAdsSiteVerification:
        d.juicyAdsSiteVerification === undefined ? undefined : d.juicyAdsSiteVerification,
      hilltopAdsSiteVerification:
        d.hilltopAdsSiteVerification === undefined ? undefined : d.hilltopAdsSiteVerification,
      homeH1: d.homeH1 === undefined ? undefined : d.homeH1,
      homeIntroHtml: d.homeIntroHtml === undefined ? undefined : d.homeIntroHtml,
      verifiedTagsIntroHtml:
        d.verifiedTagsIntroHtml === undefined ? undefined : d.verifiedTagsIntroHtml,
      gaMeasurementId:
        d.gaMeasurementId === undefined
          ? undefined
          : d.gaMeasurementId && d.gaMeasurementId.trim()
            ? d.gaMeasurementId.trim()
            : null,
      seoVideoTitleTpl: d.seoVideoTitleTpl === undefined ? undefined : d.seoVideoTitleTpl,
      seoVideoDescTpl: d.seoVideoDescTpl === undefined ? undefined : d.seoVideoDescTpl,
      seoPornstarTitleTpl: d.seoPornstarTitleTpl === undefined ? undefined : d.seoPornstarTitleTpl,
      seoPornstarDescTpl: d.seoPornstarDescTpl === undefined ? undefined : d.seoPornstarDescTpl,
      seoTagTitleTpl: d.seoTagTitleTpl === undefined ? undefined : d.seoTagTitleTpl,
      seoTagDescTpl: d.seoTagDescTpl === undefined ? undefined : d.seoTagDescTpl,
      seoCreatorTitleTpl: d.seoCreatorTitleTpl === undefined ? undefined : d.seoCreatorTitleTpl,
      seoCreatorDescTpl: d.seoCreatorDescTpl === undefined ? undefined : d.seoCreatorDescTpl,
      seoTagsIndexTitle: d.seoTagsIndexTitle === undefined ? undefined : d.seoTagsIndexTitle,
      seoTagsIndexDesc: d.seoTagsIndexDesc === undefined ? undefined : d.seoTagsIndexDesc,
      seoPornstarsIndexTitle:
        d.seoPornstarsIndexTitle === undefined ? undefined : d.seoPornstarsIndexTitle,
      seoPornstarsIndexDesc:
        d.seoPornstarsIndexDesc === undefined ? undefined : d.seoPornstarsIndexDesc,
      seoCreatorsIndexTitle:
        d.seoCreatorsIndexTitle === undefined ? undefined : d.seoCreatorsIndexTitle,
      seoCreatorsIndexDesc:
        d.seoCreatorsIndexDesc === undefined ? undefined : d.seoCreatorsIndexDesc,
      vastTagUrl: d.vastTagUrl === undefined ? undefined : d.vastTagUrl,
      vastTagUrlBackup: d.vastTagUrlBackup === undefined ? undefined : d.vastTagUrlBackup,
      adSkipSeconds: d.adSkipSeconds,
      adMinViewSeconds: d.adMinViewSeconds,
      adTimeoutMs: d.adTimeoutMs,
      exoInsClass: d.exoInsClass === undefined ? undefined : d.exoInsClass,
      exoZoneHome: d.exoZoneHome === undefined ? undefined : d.exoZoneHome,
      exoZoneUnderPlayer: d.exoZoneUnderPlayer === undefined ? undefined : d.exoZoneUnderPlayer,
      exoZoneVideoFullscreen:
        d.exoZoneVideoFullscreen === undefined ? undefined : d.exoZoneVideoFullscreen,
      exoZoneGridNative: d.exoZoneGridNative === undefined ? undefined : d.exoZoneGridNative,
      exoZoneMobileSticky: d.exoZoneMobileSticky === undefined ? undefined : d.exoZoneMobileSticky,
      exoZonePopunder: d.exoZonePopunder === undefined ? undefined : d.exoZonePopunder,
      exoZoneMidList: d.exoZoneMidList === undefined ? undefined : d.exoZoneMidList,
      juicyAdsSiteId: d.juicyAdsSiteId === undefined ? undefined : d.juicyAdsSiteId,
      juicyAdsZoneBanner: d.juicyAdsZoneBanner === undefined ? undefined : d.juicyAdsZoneBanner,
      juicyAdsZoneNative: d.juicyAdsZoneNative === undefined ? undefined : d.juicyAdsZoneNative,
      juicyAdsZoneVidfloat:
        d.juicyAdsZoneVidfloat === undefined ? undefined : d.juicyAdsZoneVidfloat,
      juicyAdsZoneInvideo:
        d.juicyAdsZoneInvideo === undefined ? undefined : d.juicyAdsZoneInvideo,
      stripchatWidgetId: d.stripchatWidgetId === undefined ? undefined : d.stripchatWidgetId,
      stripchatAffiliateUrl:
        d.stripchatAffiliateUrl === undefined ? undefined : d.stripchatAffiliateUrl,
      adsPopunderEnabled: d.adsPopunderEnabled,
      adsJuicyEnabled: d.adsJuicyEnabled,
      adsCamWidgetEnabled: d.adsCamWidgetEnabled,
    },
  });

  invalidateSiteCache();
  return NextResponse.json({ ok: true, site });
}
