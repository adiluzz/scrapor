import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { slugify } from "@/lib/slug";
import { sendMail } from "@/lib/mailer";
import { logger } from "@/lib/logger";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().max(1000).optional(),
});

/**
 * Approve → create CreatorProfile + elevate user to CREATOR.
 * Reject → mark rejected with an optional note.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const app = await prisma.creatorApplication.findFirst({ where: { id, siteId: g.siteId } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const dbUser = await prisma.user.findUnique({ where: { id: app.userId } });

  if (parsed.data.action === "approve") {
    // Ensure slug uniqueness within the site.
    let slug = slugify(app.desiredSlug || app.displayName);
    const clash = await prisma.creatorProfile.findUnique({
      where: { siteId_slug: { siteId: g.siteId, slug } },
    });
    if (clash) slug = `${slug}-${app.id.slice(-5)}`;

    await prisma.$transaction([
      prisma.creatorProfile.create({
        data: {
          userId: app.userId,
          siteId: g.siteId,
          displayName: app.displayName,
          slug,
          bio: app.bio,
        },
      }),
      prisma.user.update({ where: { id: app.userId }, data: { role: "CREATOR" } }),
      prisma.creatorApplication.update({
        where: { id },
        data: { status: "APPROVED", reviewedById: g.id, reviewNote: parsed.data.reviewNote || null },
      }),
    ]);
    if (dbUser?.email) {
      await sendMail({
        to: dbUser.email,
        subject: "Your creator application was approved 🎉",
        html: `<p>Congratulations! You're now a creator. Visit your dashboard to upload videos.</p>`,
      });
    }
    logger.info({ appId: id }, "application approved");
  } else {
    await prisma.creatorApplication.update({
      where: { id },
      data: { status: "REJECTED", reviewedById: g.id, reviewNote: parsed.data.reviewNote || null },
    });
    if (dbUser?.email) {
      await sendMail({
        to: dbUser.email,
        subject: "Update on your creator application",
        html: `<p>Thanks for applying. Unfortunately your application wasn't approved this time.</p>${
          parsed.data.reviewNote ? `<p>Note: ${parsed.data.reviewNote}</p>` : ""
        }`,
      });
    }
    logger.info({ appId: id }, "application rejected");
  }

  return NextResponse.json({ ok: true });
}
