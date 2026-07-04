import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { listPromoAdModels, PROMO_AD_CATALOG_VERSION } from "@/lib/promo-ad-models";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    catalogVersion: PROMO_AD_CATALOG_VERSION,
    models: listPromoAdModels(),
  });
}
