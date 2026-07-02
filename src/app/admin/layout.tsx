import { requireAdmin } from "@/lib/session";
import SignOutButton from "@/components/auth/SignOutButton";
import AdminShell from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <AdminShell
      signOut={
        <SignOutButton className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-500 hover:text-white" />
      }
    >
      {children}
    </AdminShell>
  );
}
