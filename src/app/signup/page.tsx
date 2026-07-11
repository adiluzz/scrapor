import { getCurrentSite } from "@/lib/site";
import SignupForm from "@/components/auth/SignupForm";
import BrandStyle from "@/components/brand/BrandStyle";

export const dynamic = "force-dynamic";

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
