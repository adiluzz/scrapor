import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import {
  redditCredentialsSchema,
  redactRedditCredentials,
  requireSite,
  upsertRedditCredentials,
} from "@/lib/reddit-admin";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(_request, "GET");
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const site = await requireSite(id);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await prisma.siteRedditCredentials.findUnique({ where: { siteId: id } });
  return NextResponse.json({ credentials: redactRedditCredentials(row) });
}

/** Keep existing secret when field omitted/blank; send "__CLEAR__" to wipe. */
function keepOrSet(next: string | null | undefined, existing: string | null): string | null {
  if (next === "__CLEAR__") return null;
  if (next === undefined || next === null || next.trim() === "") return existing;
  return next.trim();
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const site = await requireSite(id);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = redditCredentialsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const existing = await prisma.siteRedditCredentials.findUnique({ where: { siteId: id } });
  const body = parsed.data;

  const emptyToNull = (v: string | null | undefined) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = v.trim();
    return t || null;
  };

  const saved = await upsertRedditCredentials(id, {
    clientId: emptyToNull(body.clientId),
    clientSecret: keepOrSet(body.clientSecret, existing?.clientSecret ?? null),
    refreshToken: keepOrSet(body.refreshToken, existing?.refreshToken ?? null),
    username: emptyToNull(body.username),
    password: keepOrSet(body.password, existing?.password ?? null),
    userAgent: emptyToNull(body.userAgent),
  });

  return NextResponse.json({ ok: true, credentials: redactRedditCredentials(saved) });
}
