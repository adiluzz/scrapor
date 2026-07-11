import type { Metadata } from "next";
import { Suspense } from "react";
import { getCurrentSite } from "@/lib/site";
import { siteHomeDescription } from "@/lib/seo";
import LoginForm from "@/components/auth/LoginForm";
import BrandStyle from "@/components/brand/BrandStyle";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: `Sign in · ${site.name}`,
    description: siteHomeDescription(site),
  };
}

export default async function LoginPage() {
  const site = await getCurrentSite();
  const logoSite = {
    name: site.name,
    logoKey: site.logoKey,
    primaryColor: site.primaryColor,
  };

  return (
    <>
      <BrandStyle primaryColor={site.primaryColor} />
      <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
        <LoginForm site={logoSite} />
      </Suspense>
    </>
  );
}
