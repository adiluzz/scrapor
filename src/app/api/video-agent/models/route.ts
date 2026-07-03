import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { listVideoAgentModels } from "@/lib/video-agent-models";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({ models: listVideoAgentModels() });
}
