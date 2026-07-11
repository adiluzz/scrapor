import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSiteByDomain } from "@/lib/site";
import { issueCode } from "@/lib/otp";
import { sendVerificationCode } from "@/lib/mailer";
import { rateLimit } from "@/lib/redis";
import { logger } from "@/lib/logger";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

/**
 * Step 1 of login: verify the password, then email a LOGIN 2FA code.
 * No session is issued here — the session is only created after the code is
 * verified through the Credentials provider (see src/auth.ts).
 */
export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const email = parsed.data.email.toLowerCase().trim();
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      undefined;
    const site = await getSiteByDomain(host || "");

    if (!(await rateLimit(`login:${email}`, 10, 900))) {
      return NextResponse.json({ error: "Too many attempts, try later" }, { status: 429 });
    }

    const user = await prisma.user.findUnique({
      where: { siteId_email: { siteId: site.id, email } },
    });
    // Always return ok-ish to avoid user enumeration, but only send a code when valid.
    if (user && (await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      if (!user.emailVerifiedAt) {
        return NextResponse.json({ error: "Please verify your email first", next: "verify-signup" }, { status: 403 });
      }
      const code = await issueCode(email, site.id, "LOGIN");
      const brand = site.mailFromName || site.name;
      const smtpUser = process.env.SMTP_USER || "";
      const from = smtpUser ? `${brand} <${smtpUser}>` : undefined;
      await sendVerificationCode(email, code, "LOGIN", brand, from);
      logger.info({ email, siteId: site.id }, "auth: login code issued");
      return NextResponse.json({ ok: true, next: "verify-2fa" });
    }
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  } catch (err) {
    logger.error({ err: String(err) }, "login-init failed");
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
