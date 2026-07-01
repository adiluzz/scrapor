import type { Role } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      role: Role;
      siteId: string;
    };
  }
  interface User {
    role: Role;
    siteId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    siteId: string;
  }
}
