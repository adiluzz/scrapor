import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config: no Node-only imports (Prisma, bcrypt, nodemailer),
 * so it can be used inside middleware. The Credentials provider (which needs
 * the DB) is added only in the full config at src/auth.ts.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.uid = u.id;
        token.role = u.role;
        token.siteId = u.siteId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = session.user as any;
        s.id = token.uid;
        s.role = token.role;
        s.siteId = token.siteId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
