import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { parseSeoKeywords } from "@/lib/site";
import WebsiteSeoForm from "@/components/admin/WebsiteSeoForm";
import WebsiteSubnav from "@/components/admin/WebsiteSubnav";

export const dynamic = "force-dynamic";

export default async function WebsiteSeoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/websites" className="text-sm text-zinc-500 hover:text-white">
        ← Websites
      </Link>
      <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">SEO · {site.name}</h1>
      <WebsiteSubnav siteId={site.id} active="seo" />
      <WebsiteSeoForm
        siteId={site.id}
        initial={{
          seoTitle: site.seoTitle,
          seoDescription: site.seoDescription,
          seoKeywords: parseSeoKeywords(site.seoKeywords).join(", "),
          ogImagePath: site.ogImagePath,
          exoSiteVerification: site.exoSiteVerification,
          juicyAdsSiteVerification: site.juicyAdsSiteVerification,
          hilltopAdsSiteVerification: site.hilltopAdsSiteVerification,
          homeH1: site.homeH1,
          homeIntroHtml: site.homeIntroHtml,
          gaMeasurementId: site.gaMeasurementId,
          seoVideoTitleTpl: site.seoVideoTitleTpl,
          seoVideoDescTpl: site.seoVideoDescTpl,
          seoPornstarTitleTpl: site.seoPornstarTitleTpl,
          seoPornstarDescTpl: site.seoPornstarDescTpl,
          seoTagTitleTpl: site.seoTagTitleTpl,
          seoTagDescTpl: site.seoTagDescTpl,
          seoCreatorTitleTpl: site.seoCreatorTitleTpl,
          seoCreatorDescTpl: site.seoCreatorDescTpl,
          seoTagsIndexTitle: site.seoTagsIndexTitle,
          seoTagsIndexDesc: site.seoTagsIndexDesc,
          seoPornstarsIndexTitle: site.seoPornstarsIndexTitle,
          seoPornstarsIndexDesc: site.seoPornstarsIndexDesc,
          seoCreatorsIndexTitle: site.seoCreatorsIndexTitle,
          seoCreatorsIndexDesc: site.seoCreatorsIndexDesc,
        }}
      />
    </div>
  );
}
