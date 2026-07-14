import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site";
import { siteHomeDescription } from "@/lib/seo";
import SignupForm from "@/components/auth/SignupForm";
import BrandStyle from "@/components/brand/BrandStyle";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: `Sign up · ${site.name}`,
    description: siteHomeDescription(site),
    robots: { index: false, follow: false },
  };
}

export default async function SignupPage() {
  const site = await getCurrentSite();
  return (
    <>
      <BrandStyle primaryColor={site.primaryColor} />
      <SignupForm
        site={{
          name: site.name,
          logoKey: site.logoKey,
          primaryColor: site.primaryColor,
        }}
      />
    </>
  );
}
