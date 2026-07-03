import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  apiKeyTypeLabel,
  generateApiKey,
  isApiKeyType,
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

function serializeApiKey(row: {
  id: string;
  keyNumber: number;
  name: string;
  type: import("@prisma/client").ApiKeyType;
  createdByUserId: string;
  updatedByUserId: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: { email: string } | null;
  updatedBy?: { email: string } | null;
}) {
  return {
    id: row.id,
    keyNumber: row.keyNumber,
    name: row.name,
    type: row.type,
    typeLabel: apiKeyTypeLabel(row.type),
    maskedHint: maskedApiKeyHint(row.type, row.keyNumber),
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
    createdByName: row.createdBy?.email ?? null,
    updatedByName: row.updatedBy?.email ?? null,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET() {
  try {
    const user = await requireAdminSession();
    if (user instanceof NextResponse) return user;

    const keys = await prisma.apiKey.findMany({
      where: { siteId: user.siteId },
      include: {
        createdBy: { select: { email: true } },
        updatedBy: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(keys.map(serializeApiKey));
  } catch (error) {
    logger.error({ err: error }, "Error fetching API keys");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminSession();
    if (user instanceof NextResponse) return user;

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const type = body.type;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!isApiKeyType(type)) {
      return NextResponse.json({ error: "Invalid API key type" }, { status: 400 });
    }

    const row = await prisma.apiKey.create({
      data: {
        name,
        type,
        keyHash: "pending",
        siteId: user.siteId,
        createdByUserId: user.id,
        updatedByUserId: user.id,
      },
    });

    const { rawKey, hash } = generateApiKey(type, row.keyNumber);
    const updated = await prisma.apiKey.update({
      where: { id: row.id },
      data: { keyHash: hash },
      include: {
        createdBy: { select: { email: true } },
        updatedBy: { select: { email: true } },
      },
    });

    return NextResponse.json({
      apiKey: rawKey,
      key: serializeApiKey(updated),
    });
  } catch (error: unknown) {
    logger.error({ err: error }, "Error creating API key");
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("API_KEY_SECRET")) {
      return NextResponse.json({ error: "API key service unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
