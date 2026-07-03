import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logger } from "@/lib/logger";

async function requireAdminSession() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdminSession();
    if (user instanceof NextResponse) return user;

    const { id } = await params;
    const row = await prisma.apiKey.findFirst({
      where: { id, siteId: user.siteId },
    });
    if (!row) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    await prisma.apiKey.update({
      where: { id },
      data: { name, updatedByUserId: user.id },
    });

    return NextResponse.json({ id, name });
  } catch (error) {
    logger.error({ err: error }, "Error updating API key");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdminSession();
    if (user instanceof NextResponse) return user;

    const { id } = await params;
    const row = await prisma.apiKey.findFirst({
      where: { id, siteId: user.siteId },
    });
    if (!row) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    if (row.revokedAt) {
      return NextResponse.json({ error: "API key already revoked" }, { status: 400 });
    }

    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date(), updatedByUserId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, "Error revoking API key");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
