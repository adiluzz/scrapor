import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSiteByDomain } from "@/lib/site";
import { issueCode } from "@/lib/otp";
import { sendVerificationCode } from "@/lib/mailer";
import { rateLimit } from "@/lib/redis";
import { logger } from "@/lib/logger";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email or password (min 8 chars)" }, { status: 400 });
    }
    const email = parsed.data.email.toLowerCase().trim();
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      undefined;
    const site = await getSiteByDomain(host || "");

    if (!(await rateLimit(`register:${email}`, 5, 3600))) {
      return NextResponse.json({ error: "Too many attempts, try later" }, { status: 429 });
    }

    const existing = await prisma.user.findUnique({
      where: { siteId_email: { siteId: site.id, email } },
    });
    if (existing?.emailVerifiedAt) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
    } else {
      await prisma.user.create({
        data: { email, passwordHash, siteId: site.id, role: "USER" },
      });
    }

    const code = await issueCode(email, site.id, "SIGNUP");
    const brand = site.mailFromName || site.name;
    const smtpUser = process.env.SMTP_USER || "";
    const from = smtpUser ? `${brand} <${smtpUser}>` : undefined;
    await sendVerificationCode(email, code, "SIGNUP", brand, from);
    logger.info({ email, siteId: site.id }, "auth: signup code issued");

    return NextResponse.json({ ok: true, next: "verify-signup" });
  } catch (err) {
    logger.error({ err: String(err) }, "register failed");
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
