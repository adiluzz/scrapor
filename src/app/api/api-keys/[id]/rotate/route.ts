import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  apiKeyTypeLabel,
  generateApiKey,
  maskedApiKeyHint,
} from "@/lib/api-key";
import { getCurrentUser } from "@/lib/session";
import { logger } from "@/lib/logger";

async function requireAdminSession() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdminSession();
    if (user instanceof NextResponse) return user;

    const { id } = await params;
    const row = await prisma.apiKey.findFirst({
      where: { id, siteId: user.siteId },
      include: { updatedBy: { select: { email: true } } },
    });
    if (!row) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    if (row.revokedAt) {
      return NextResponse.json({ error: "Cannot rotate a revoked API key" }, { status: 400 });
    }

    const { rawKey, hash } = generateApiKey(row.type, row.keyNumber);
    const updated = await prisma.apiKey.update({
      where: { id },
      data: { keyHash: hash, updatedByUserId: user.id },
      include: { updatedBy: { select: { email: true } } },
    });

    return NextResponse.json({
      apiKey: rawKey,
      key: {
        id: updated.id,
        keyNumber: updated.keyNumber,
        name: updated.name,
        type: updated.type,
        typeLabel: apiKeyTypeLabel(updated.type),
        maskedHint: maskedApiKeyHint(updated.type, updated.keyNumber),
        updatedByUserId: updated.updatedByUserId,
        updatedByName: updated.updatedBy?.email ?? null,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "Error rotating API key");
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("API_KEY_SECRET")) {
      return NextResponse.json({ error: "API key service unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
