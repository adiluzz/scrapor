import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import type { RedditCredentials } from "@/lib/reddit";
import { RedditApiError } from "@/lib/reddit";

const emptyToNull = (v: string | null | undefined) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t || null;
};

export const redditCredentialsSchema = z.object({
  clientId: z.string().max(200).nullable().optional(),
  clientSecret: z.string().max(200).nullable().optional(),
  refreshToken: z.string().max(2000).nullable().optional(),
  username: z.string().max(80).nullable().optional(),
  password: z.string().max(200).nullable().optional(),
  userAgent: z.string().max(300).nullable().optional(),
});

export type RedditCredentialsInput = z.infer<typeof redditCredentialsSchema>;

export async function requireSite(siteId: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true, name: true, domain: true } });
  if (!site) return null;
  return site;
}

export async function loadRedditCredentials(siteId: string): Promise<RedditCredentials | null> {
  const row = await prisma.siteRedditCredentials.findUnique({ where: { siteId } });
  if (!row?.clientId || !row.clientSecret) return null;
  return {
    clientId: row.clientId,
    clientSecret: row.clientSecret,
    refreshToken: row.refreshToken,
    username: row.username,
    password: row.password,
    userAgent: row.userAgent,
  };
}

export async function upsertRedditCredentials(siteId: string, input: RedditCredentialsInput) {
  const data = {
    clientId: emptyToNull(input.clientId),
    clientSecret: emptyToNull(input.clientSecret),
    refreshToken: emptyToNull(input.refreshToken),
    username: emptyToNull(input.username),
    password: emptyToNull(input.password),
    userAgent: emptyToNull(input.userAgent),
  };

  return prisma.siteRedditCredentials.upsert({
    where: { siteId },
    create: { siteId, ...data },
    update: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
  });
}

/** Safe summary for admin UI (secrets present but redacted). */
export function redactRedditCredentials(row: {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  username: string | null;
  password: string | null;
  userAgent: string | null;
} | null) {
  if (!row) {
    return {
      clientId: "",
      username: "",
      userAgent: "",
      hasClientSecret: false,
      hasRefreshToken: false,
      hasPassword: false,
      configured: false,
    };
  }
  return {
    clientId: row.clientId || "",
    username: row.username || "",
    userAgent: row.userAgent || "",
    hasClientSecret: Boolean(row.clientSecret),
    hasRefreshToken: Boolean(row.refreshToken),
    hasPassword: Boolean(row.password),
    configured: Boolean(row.clientId && row.clientSecret && (row.refreshToken || (row.username && row.password))),
  };
}

export function redditErrorResponse(err: unknown) {
  if (err instanceof RedditApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status && err.status < 500 ? err.status : 400 });
  }
  const message = err instanceof Error ? err.message : "Reddit request failed";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function guardRedditRoute(request: Request, siteId: string) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return { error: g as NextResponse };
  const site = await requireSite(siteId);
  if (!site) return { error: NextResponse.json({ error: "Site not found" }, { status: 404 }) };
  const creds = await loadRedditCredentials(siteId);
  if (!creds) {
    return {
      error: NextResponse.json(
        { error: "Reddit credentials are not configured for this site" },
        { status: 400 }
      ),
    };
  }
  return { site, creds };
}
