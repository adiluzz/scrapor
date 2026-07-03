import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { listBedrockModelIds } from "@/lib/bedrock";
import { isLikelyToolModel, isLikelyVisionModel } from "@/lib/model-capabilities";

export async function GET(request: Request) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;

  const models = listBedrockModelIds().map((id) => ({
    id,
    supportsTools: isLikelyToolModel(id),
    hasVision: isLikelyVisionModel(id),
  }));

  return NextResponse.json({
    models,
    region: process.env.AWS_REGION || "us-east-1",
  });
}