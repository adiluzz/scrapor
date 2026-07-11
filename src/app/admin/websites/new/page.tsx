import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import NewWebsiteForm from "@/components/admin/NewWebsiteForm";

export const dynamic = "force-dynamic";

export default async function NewWebsitePage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/websites" className="text-sm text-zinc-500 hover:text-white">
        ← Websites
      </Link>
      <h1 className="mt-2 mb-6 text-xl font-bold text-white sm:text-2xl">New website</h1>
      <NewWebsiteForm />
    </div>
  );
}
