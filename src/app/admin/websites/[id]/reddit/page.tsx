import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import WebsiteRedditForm from "@/components/admin/WebsiteRedditForm";
import WebsiteSubnav from "@/components/admin/WebsiteSubnav";
import { redactRedditCredentials } from "@/lib/reddit-admin";

export const dynamic = "force-dynamic";

export default async function WebsiteRedditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) notFound();

  const row = await prisma.siteRedditCredentials.findUnique({ where: { siteId: id } });

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/websites" className="text-sm text-zinc-500 hover:text-white">
        ← Websites
      </Link>
      <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">Reddit · {site.name}</h1>
      <WebsiteSubnav siteId={site.id} active="reddit" />
      <p className="mb-4 text-sm text-zinc-500">
        Connect this website&apos;s Reddit / Devvit app, create communities, and publish posts
        (including native video uploads from the library).
      </p>
      <WebsiteRedditForm
        siteId={site.id}
        siteDomain={site.domain}
        initial={redactRedditCredentials(row)}
      />
    </div>
  );
}
