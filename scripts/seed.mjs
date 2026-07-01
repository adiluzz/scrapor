/**
 * Seed the first Site + an ADMIN user.
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret123 \
 *   SITE_DOMAIN=pisster.com SITE_NAME=Pisster node scripts/seed.mjs
 *
 * In Docker:
 *   docker compose exec -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... web node scripts/seed.mjs
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const domain = process.env.SITE_DOMAIN || process.env.PRIMARY_DOMAIN || "pisster.com";
const name = process.env.SITE_NAME || "Pisster";
const email = (process.env.ADMIN_EMAIL || "admin@pisster.com").toLowerCase();
const password = process.env.ADMIN_PASSWORD || "changeme123";

async function main() {
  const site = await prisma.site.upsert({
    where: { domain },
    update: { name },
    create: { domain, name },
  });
  console.log(`Site ready: ${site.domain} (${site.id})`);

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.upsert({
    where: { siteId_email: { siteId: site.id, email } },
    update: { role: "ADMIN", passwordHash, emailVerifiedAt: new Date() },
    create: {
      email,
      passwordHash,
      role: "ADMIN",
      siteId: site.id,
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Admin ready: ${admin.email} (role=${admin.role})`);
  console.log("\nLog in at https://admin." + domain + " with the credentials above.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
