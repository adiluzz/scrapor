import { Suspense } from "react";
import { getCurrentSite } from "@/lib/site";
import LoginForm from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const site = await getCurrentSite();
  const logoSite = {
    name: site.name,
    logoKey: site.logoKey,
    primaryColor: site.primaryColor,
  };

  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LoginForm site={logoSite} />
    </Suspense>
  );
}
