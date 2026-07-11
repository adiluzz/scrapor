/**
 * Create / upsert a Site row from the CLI (DB only — still run provision-site.sh for edge).
 *
 *   node scripts/create-site.mjs --domain=example.com --name="Example" --slug=example --kind=TUBE
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const domain = arg("domain");
const name = arg("name");
const slug = arg("slug", domain?.split(".")[0]);
const kind = (arg("kind", "TUBE") || "TUBE").toUpperCase();
const primaryColor = arg("color", kind === "STUDIO" ? "#C4A574" : "#3B82A0");

if (!domain || !name || !slug) {
  console.error("Required: --domain= --name= --slug=");
  process.exit(1);
}

async function main() {
  const site = await prisma.site.upsert({
    where: { domain },
    update: {
      name,
      slug,
      kind: kind === "STUDIO" ? "STUDIO" : "TUBE",
      primaryColor,
      isNetworkMember: true,
      mailFromName: name,
    },
    create: {
      domain,
      name,
      slug,
      kind: kind === "STUDIO" ? "STUDIO" : "TUBE",
      primaryColor,
      isNetworkMember: true,
      mailFromName: name,
      logoPath: `/brand/${slug}-lockup.png`,
      logoKey: kind === "STUDIO" ? "sharlila-mark" : "fbb-mark",
      tagline: `${name}`,
      seoTitle: name,
      seoDescription: `${name}`,
      homeH1: name,
      networkOrder: 99,
    },
  });
  console.log(`Site upserted: ${site.domain} (${site.id}) kind=${site.kind}`);
  console.log(`Next: ./scripts/provision-site.sh ${domain}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
