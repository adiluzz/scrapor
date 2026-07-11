import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardApiRoute, isSessionAuth } from "@/lib/admin-guard";
import { getCurrentSite } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { sendCreatorApplicationReceived, sendAdminNewApplication } from "@/lib/mailer";
import { logger } from "@/lib/logger";

const schema = z.object({
  displayName: z.string().min(2).max(60),
  desiredSlug: z.string().min(2).max(60).optional(),
  bio: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const auth = await guardApiRoute(request, "POST");
  if (auth instanceof NextResponse) return auth;
  if (!isSessionAuth(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = auth;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const site = await getCurrentSite();

  if (user.role === "CREATOR") {
    return NextResponse.json({ error: "You are already a creator" }, { status: 409 });
  }
  const pending = await prisma.creatorApplication.findFirst({
    where: { userId: user.userId, siteId: site.id, status: "PENDING" },
  });
  if (pending) return NextResponse.json({ error: "You already have a pending application" }, { status: 409 });

  const app = await prisma.creatorApplication.create({
    data: {
      userId: user.userId,
      siteId: site.id,
      displayName: parsed.data.displayName,
      desiredSlug: slugify(parsed.data.desiredSlug || parsed.data.displayName),
      bio: parsed.data.bio || null,
    },
  });

  // Fire both notification emails (never block the submit on mail failure).
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const reviewUrl = `${proto}://${process.env.ADMIN_SUBDOMAIN || "admin"}.${site.domain}/admin/applications`;
  const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
  try {
    const brand = site.mailFromName || site.name;
    const smtpUser = process.env.SMTP_USER || "";
    const from = smtpUser ? `${brand} <${smtpUser}>` : undefined;
    await Promise.all([
      dbUser?.email
        ? sendCreatorApplicationReceived(dbUser.email, parsed.data.displayName, brand, from)
        : Promise.resolve(),
      sendAdminNewApplication({
        applicantEmail: dbUser?.email || "unknown",
        displayName: parsed.data.displayName,
        siteDomain: site.domain,
        reviewUrl,
        brandName: brand,
      }),
    ]);
  } catch (err) {
    logger.error({ err: String(err) }, "creator apply emails failed");
  }

  logger.info({ userId: user.userId, appId: app.id }, "creator application submitted");
  return NextResponse.json({ ok: true });
}
