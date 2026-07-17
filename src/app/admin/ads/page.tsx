import { redirect } from "next/navigation";

/** Promo ads UI removed — compose via Video editor; clips under Ad clips. */
export default function PromoAdsRedirect() {
  redirect("/admin/ad-clips");
}
