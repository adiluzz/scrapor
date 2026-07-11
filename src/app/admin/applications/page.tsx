import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import ApplicationActions from "@/components/admin/ApplicationActions";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  PENDING: "text-yellow-400",
  APPROVED: "text-emerald-400",
  REJECTED: "text-red-400",
};

export default async function ApplicationsPage() {
  await requireAdmin();
  const apps = await prisma.creatorApplication.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { user: { select: { email: true } } },
    take: 100,
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-white sm:text-2xl">Creator applications</h1>
      <div className="space-y-3">
        {apps.length === 0 ? (
          <p className="py-8 text-center text-zinc-500">No applications.</p>
        ) : (
          apps.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <p className="font-medium text-white">
                  {a.displayName} <span className={`ml-2 text-sm ${statusColor[a.status]}`}>{a.status}</span>
                </p>
                <p className="text-sm text-zinc-500">{a.user.email} · wants /creators/{a.desiredSlug}</p>
                {a.bio && <p className="mt-1 max-w-xl text-sm text-zinc-400">{a.bio}</p>}
                {a.reviewNote && <p className="mt-1 text-xs text-zinc-500">Note: {a.reviewNote}</p>}
              </div>
              {a.status === "PENDING" && <ApplicationActions id={a.id} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
