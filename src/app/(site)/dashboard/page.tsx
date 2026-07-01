import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import CreatorApplyForm from "@/components/dashboard/CreatorApplyForm";
import CreatorUpload from "@/components/dashboard/CreatorUpload";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [profile, application, dbUser] = await Promise.all([
    prisma.creatorProfile.findUnique({
      where: { userId: user.id },
      include: { videos: { where: { isDeleted: false }, orderBy: { createdAt: "desc" }, take: 24 } },
    }),
    prisma.creatorApplication.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findUnique({ where: { id: user.id } }),
  ]);

  const isCreator = user.role === "CREATOR" && profile;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold text-white">Dashboard</h1>
      <p className="mb-6 text-sm text-zinc-500">{dbUser?.email}</p>

      {isCreator ? (
        <div className="space-y-8">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300">
            You&apos;re a creator!{" "}
            <Link href={`/creators/${profile!.slug}`} className="underline">View your page →</Link>
          </div>
          <CreatorUpload />
          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">Your videos</h2>
            {profile!.videos.length === 0 ? (
              <p className="text-sm text-zinc-500">No videos yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
                {profile!.videos.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-300">
                    {v.status === "READY" ? (
                      <Link href={`/videos/${v.slug}`} className="hover:text-white">{v.title}</Link>
                    ) : (
                      <span className="text-zinc-400">{v.title}</span>
                    )}
                    {v.status === "PENDING" || v.status === "PROCESSING" ? (
                      <span className="rounded bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-400">
                        Processing…
                      </span>
                    ) : v.status === "FAILED" ? (
                      <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
                        Failed
                      </span>
                    ) : (
                      <span className="text-zinc-600">· {v.viewCount} views</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : application?.status === "PENDING" ? (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6 text-yellow-300">
          Your creator application for <strong>{application.displayName}</strong> is under review.
        </div>
      ) : application?.status === "REJECTED" ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
            Your previous application was not approved.
            {application.reviewNote && <p className="mt-1 text-sm">Note: {application.reviewNote}</p>}
          </div>
          <CreatorApplyForm />
        </div>
      ) : (
        <CreatorApplyForm />
      )}
    </div>
  );
}
