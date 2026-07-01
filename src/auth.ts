import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import { getSiteByDomain } from "@/lib/site";
import { verifyCode } from "@/lib/otp";
import { logger } from "@/lib/logger";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        code: {},
        mode: {}, // "login" | "signup"
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email || "").toLowerCase().trim();
        const password = String(credentials?.password || "");
        const code = String(credentials?.code || "");
        const mode = String(credentials?.mode || "login");
        if (!email || !password || !code) return null;

        const host =
          request?.headers?.get("x-forwarded-host") ||
          request?.headers?.get("host") ||
          undefined;
        const site = await getSiteByDomain(host || "");

        const user = await prisma.user.findUnique({
          where: { siteId_email: { siteId: site.id, email } },
        });
        if (!user) return null;

        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) return null;

        if (mode === "signup") {
          const ok = await verifyCode(email, site.id, "SIGNUP", code);
          if (!ok) return null;
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerifiedAt: new Date() },
          });
        } else {
          if (!user.emailVerifiedAt) return null;
          const ok = await verifyCode(email, site.id, "LOGIN", code);
          if (!ok) return null;
        }

        logger.info({ userId: user.id, siteId: site.id, mode }, "auth: session issued");
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          siteId: user.siteId,
        };
      },
    }),
  ],
});
