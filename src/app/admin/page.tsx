import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 hover:border-pink-500/50">
      <div className="text-3xl font-bold text-white">{value.toLocaleString()}</div>
      <div className="mt-1 text-sm text-zinc-400">{label}</div>
    </Link>
  );
}

export default async function AdminHome() {
  const user = await requireAdmin();
  const siteId = user.siteId;

  const [videos, pornstars, creators, pendingApps, runs] = await Promise.all([
    prisma.video.count({ where: { siteId, isDeleted: false } }),
    prisma.pornstar.count({ where: { siteId } }),
    prisma.creatorProfile.count({ where: { siteId } }),
    prisma.creatorApplication.count({ where: { siteId, status: "PENDING" } }),
    prisma.scrapeRun.count({ where: { siteId } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Overview</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Videos" value={videos} href="/admin/videos" />
        <Stat label="Pornstars" value={pornstars} href="/admin/videos" />
        <Stat label="Creators" value={creators} href="/admin/creators" />
        <Stat label="Pending applications" value={pendingApps} href="/admin/applications" />
        <Stat label="Scrape runs" value={runs} href="/admin/scrape-runs" />
      </div>
    </div>
  );
}
