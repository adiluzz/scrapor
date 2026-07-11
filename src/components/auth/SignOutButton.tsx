import { signOut } from "@/auth";

/**
 * Sign out via a server action instead of linking to NextAuth's built-in
 * GET /api/auth/signout page. That default page can still build absolute URLs
 * from a bad request origin when running standalone behind a proxy; the server
 * action redirects relatively and stays on the current public host.
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
