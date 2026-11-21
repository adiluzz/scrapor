import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { slugify } from "@/lib/slug";
import { sendMail, sendCreatorApplicationApproved } from "@/lib/mailer";
import { logger } from "@/lib/logger";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().max(1000).optional(),
});

/**
 * Approve → create CreatorProfile + elevate user to CREATOR.
 * Reject → mark rejected with an optional note.
 *
 * Platform admin reviews apps from every site; look up by id only and attach
 * the CreatorProfile to the application's site (not the admin user's site).
 * Creators share one dashboard UX; uploads publish on the application site.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const app = await prisma.creatorApplication.findUnique({
    where: { id },
    include: { site: { select: { id: true, domain: true, name: true, mailFromName: true } } },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (app.status !== "PENDING") {
    return NextResponse.json({ error: `Application already ${app.status.toLowerCase()}` }, { status: 409 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const dbUser = await prisma.user.findUnique({ where: { id: app.userId } });
  const siteId = app.siteId;
  const brand = app.site.mailFromName || app.site.name;
  const smtpUser = process.env.SMTP_USER || "";
  const from = smtpUser ? `${brand} <${smtpUser}>` : undefined;

  if (parsed.data.action === "approve") {
    // Ensure slug uniqueness within the applicant's site.
    let slug = slugify(app.desiredSlug || app.displayName);
    const clash = await prisma.creatorProfile.findUnique({
      where: { siteId_slug: { siteId, slug } },
    });
    if (clash) slug = `${slug}-${app.id.slice(-5)}`;

    const existingProfile = await prisma.creatorProfile.findUnique({ where: { userId: app.userId } });
    if (existingProfile) {
      return NextResponse.json({ error: "User already has a creator profile" }, { status: 409 });
    }

    await prisma.$transaction([
      prisma.creatorProfile.create({
        data: {
          userId: app.userId,
          siteId,
          displayName: app.displayName,
          slug,
          bio: app.bio,
        },
      }),
      prisma.user.update({ where: { id: app.userId }, data: { role: "CREATOR" } }),
      prisma.creatorApplication.update({
        where: { id },
        data: { status: "APPROVED", reviewedById: authUserId(g), reviewNote: parsed.data.reviewNote || null },
      }),
    ]);
    if (dbUser?.email) {
      const dashboardUrl = `https://${app.site.domain}/dashboard`;
      await sendCreatorApplicationApproved({
        to: dbUser.email,
        displayName: app.displayName,
        siteDomain: app.site.domain,
        brandName: brand,
        dashboardUrl,
        reviewNote: parsed.data.reviewNote,
        from,
      });
    }
    logger.info({ appId: id, siteId, siteDomain: app.site.domain }, "application approved");
  } else {
    await prisma.creatorApplication.update({
      where: { id },
      data: { status: "REJECTED", reviewedById: authUserId(g), reviewNote: parsed.data.reviewNote || null },
    });
    if (dbUser?.email) {
      await sendMail({
        to: dbUser.email,
        subject: `Update on your ${brand} creator application`,
        html: `<p>Thanks for applying to ${brand}. Unfortunately your application wasn't approved this time.</p>${
          parsed.data.reviewNote ? `<p>Note: ${parsed.data.reviewNote}</p>` : ""
        }`,
        from,
      });
    }
    logger.info({ appId: id, siteId, siteDomain: app.site.domain }, "application rejected");
  }

  return NextResponse.json({ ok: true });
}
