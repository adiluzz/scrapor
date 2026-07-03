import { NextResponse } from "next/server";
import type { ApiKeyType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseApiKey, verifyApiKey } from "@/lib/api-key";

export type AuthenticatedApiKey = {
  apiKeyId: string;
  keyNumber: number;
  type: ApiKeyType;
  name: string;
  siteId: string;
};

export function extractApiKey(request: Request): string | null {
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("apiKey")?.trim();
  if (queryKey) return queryKey;

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  return null;
}

export async function authenticateApiKey(
  request: Request,
  allowedTypes?: ApiKeyType[]
): Promise<
  | { ok: true; apiKey: AuthenticatedApiKey }
  | { ok: false; response: NextResponse }
> {
  const rawKey = extractApiKey(request);
  if (!rawKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const parsed = parseApiKey(rawKey);
  if (!parsed.valid || parsed.keyNumber == null || !parsed.type) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (allowedTypes && !allowedTypes.includes(parsed.type)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const row = await prisma.apiKey.findUnique({
    where: { keyNumber: parsed.keyNumber },
  });
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (row.revokedAt) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!verifyApiKey(rawKey, row.keyHash)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (row.type !== parsed.type) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (allowedTypes && !allowedTypes.includes(row.type)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  await prisma.apiKey.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    ok: true,
    apiKey: {
      apiKeyId: row.id,
      keyNumber: row.keyNumber,
      type: row.type,
      name: row.name,
      siteId: row.siteId,
    },
  };
}
