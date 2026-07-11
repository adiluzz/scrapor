import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site";
import { buildOpenGraph, keywordsMeta } from "@/lib/seo";

const CONTACT_EMAIL = "contact@sharlila.com";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.kind !== "STUDIO") {
    return { title: "Contact" };
  }
  const title = `Contact · ${site.name}`;
  const description = `Get in touch with ${site.name} Productions at ${CONTACT_EMAIL}.`;
  return {
    title,
    description,
    keywords: keywordsMeta(site, ["contact", CONTACT_EMAIL]),
    alternates: { canonical: "/contact" },
    openGraph: buildOpenGraph({
      title,
      description,
      url: "/contact",
      siteName: site.name,
    }),
  };
}

export default async function ContactPage() {
  const site = await getCurrentSite();
  if (site.kind !== "STUDIO") notFound();

  return (
    <div className="mx-auto max-w-2xl py-10 sm:py-16">
      <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Sharlila Productions</p>
      <h1 className="mt-3 text-4xl font-black text-white">Contact</h1>
      <p className="mt-4 text-zinc-400">
        Questions about productions, licensing, or collaboration? Reach us at:
      </p>
      <p className="mt-8">
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-2xl font-semibold hover:underline"
          style={{ color: site.primaryColor }}
        >
          {CONTACT_EMAIL}
        </a>
      </p>
      <p className="mt-10 text-sm text-zinc-500">
        Or explore{" "}
        <Link href="/our-network" className="text-zinc-300 hover:underline">
          Our Network
        </Link>
        .
      </p>
    </div>
  );
}
