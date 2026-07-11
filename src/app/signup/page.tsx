import { getCurrentSite } from "@/lib/site";
import SignupForm from "@/components/auth/SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const site = await getCurrentSite();
  return (
    <SignupForm
      site={{
        name: site.name,
        logoKey: site.logoKey,
        primaryColor: site.primaryColor,
      }}
    />
  );
}
