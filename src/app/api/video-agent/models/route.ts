import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { resolveBedrockInferenceModelId } from "@/lib/bedrock-inference";
import { listVideoAgentModels } from "@/lib/video-agent-models";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const region = process.env.AWS_REGION || "us-east-1";
  const models = listVideoAgentModels().map((m) => ({
    ...m,
    resolvedBedrockModelId: m.bedrockModelId
      ? resolveBedrockInferenceModelId(m.bedrockModelId, region)
      : undefined,
  }));

  return NextResponse.json({ models, region });
}
