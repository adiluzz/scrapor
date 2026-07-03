import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";

/** JSON video search for agents and admin tools. */
export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const params = parseDiscoveryParams(Object.fromEntries(url.searchParams.entries()));

  const { videos, total, totalPages } = await listVideos(auth.siteId, params);
  return NextResponse.json({ videos, total, totalPages, page: params.page });
}
