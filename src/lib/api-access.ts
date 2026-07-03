import { NextResponse } from "next/server";
import type { ApiKeyType } from "@prisma/client";
import { getCurrentUser } from "@/lib/session";
import { getCurrentSiteId } from "@/lib/site";
import { authenticateApiKey, extractApiKey } from "@/lib/api-key-auth";

export type SessionAuthContext = {
  kind: "session";
  userId: string;
  siteId: string;
  role: "ADMIN" | "USER" | "CREATOR";
  email: string;
};

export type ApiKeyAuthContext = {
  kind: "api_key";
  apiKeyId: string;
  keyNumber: number;
  type: ApiKeyType;
  name: string;
  siteId: string;
};

export type AnonymousAuthContext = {
  kind: "anonymous";
  siteId: string;
};

export type AuthContext = SessionAuthContext | ApiKeyAuthContext | AnonymousAuthContext;

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function methodAllowsReadOnly(method: string): boolean {
  return READ_METHODS.has(method.toUpperCase());
}

function apiKeyAllowsMethod(type: ApiKeyType, method: string): boolean {
  if (type === "FULL_ACCESS") return true;
  return methodAllowsReadOnly(method);
}

/** Dual-auth guard for public/user API routes. Anonymous access allowed when no API key is sent. */
export async function guardApiRoute(
  request: Request,
  method?: string
): Promise<AuthContext | NextResponse> {
  const httpMethod = (method || request.method).toUpperCase();

  const user = await getCurrentUser();
  if (user) {
    return {
      kind: "session",
      userId: user.id,
      siteId: user.siteId,
      role: user.role,
      email: user.email || "",
    };
  }

  const rawKey = extractApiKey(request);
  if (rawKey) {
    const authResult = await authenticateApiKey(request);
    if (!authResult.ok) return authResult.response;

    if (!apiKeyAllowsMethod(authResult.apiKey.type, httpMethod)) {
      return forbidden();
    }

    return {
      kind: "api_key",
      apiKeyId: authResult.apiKey.apiKeyId,
      keyNumber: authResult.apiKey.keyNumber,
      type: authResult.apiKey.type,
      name: authResult.apiKey.name,
      siteId: authResult.apiKey.siteId,
    };
  }

  return { kind: "anonymous", siteId: await getCurrentSiteId() };
}

/** Dual-auth guard for admin API routes (session ADMIN or FULL_ACCESS key). */
export async function guardAdmin(
  request: Request,
  method?: string
): Promise<AuthContext | NextResponse> {
  const httpMethod = (method || request.method).toUpperCase();

  const user = await getCurrentUser();
  if (user?.role === "ADMIN") {
    return {
      kind: "session",
      userId: user.id,
      siteId: user.siteId,
      role: user.role,
      email: user.email || "",
    };
  }

  const authResult = await authenticateApiKey(request, ["FULL_ACCESS"]);
  if (!authResult.ok) return forbidden();

  if (!apiKeyAllowsMethod(authResult.apiKey.type, httpMethod)) {
    return forbidden();
  }

  return {
    kind: "api_key",
    apiKeyId: authResult.apiKey.apiKeyId,
    keyNumber: authResult.apiKey.keyNumber,
    type: authResult.apiKey.type,
    name: authResult.apiKey.name,
    siteId: authResult.apiKey.siteId,
  };
}

/** Dual-auth guard for creator routes (session CREATOR/ADMIN or FULL_ACCESS key). */
export async function guardCreator(
  request: Request,
  method?: string
): Promise<AuthContext | NextResponse> {
  const httpMethod = (method || request.method).toUpperCase();

  const user = await getCurrentUser();
  if (user && (user.role === "CREATOR" || user.role === "ADMIN")) {
    return {
      kind: "session",
      userId: user.id,
      siteId: user.siteId,
      role: user.role,
      email: user.email || "",
    };
  }

  const authResult = await authenticateApiKey(request, ["FULL_ACCESS"]);
  if (!authResult.ok) return unauthorized();

  if (!apiKeyAllowsMethod(authResult.apiKey.type, httpMethod)) {
    return forbidden();
  }

  return {
    kind: "api_key",
    apiKeyId: authResult.apiKey.apiKeyId,
    keyNumber: authResult.apiKey.keyNumber,
    type: authResult.apiKey.type,
    name: authResult.apiKey.name,
    siteId: authResult.apiKey.siteId,
  };
}

/** API-key-only guard for docs/openapi (any active key type). */
export async function guardApiKeyOnly(request: Request) {
  const authResult = await authenticateApiKey(request);
  if (!authResult.ok) return authResult.response;
  return authResult.apiKey;
}

export function authSiteId(auth: AuthContext): string {
  return auth.siteId;
}

export function authUserId(auth: AuthContext): string | null {
  return auth.kind === "session" ? auth.userId : null;
}

export function isApiKeyAuth(auth: AuthContext): auth is ApiKeyAuthContext {
  return auth.kind === "api_key";
}

export function isSessionAuth(auth: AuthContext): auth is SessionAuthContext {
  return auth.kind === "session";
}

export function isAnonymousAuth(auth: AuthContext): auth is AnonymousAuthContext {
  return auth.kind === "anonymous";
}
