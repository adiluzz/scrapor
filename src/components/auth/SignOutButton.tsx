import { signOut } from "@/auth";

/**
 * Sign out via a server action instead of linking to NextAuth's built-in
 * GET /api/auth/signout page. That default page builds absolute URLs from the
 * container's bind address (HOSTNAME=0.0.0.0:3000) when running standalone
 * behind a proxy, which breaks the redirect. The server action redirects
 * relatively, so it always stays on the current public host.
 */
export default function SignOutButton({ className }: { className?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className={className}>
        Sign out
      </button>
    </form>
  );
}
