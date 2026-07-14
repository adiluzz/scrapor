import Link from "next/link";
import type { PopularLink } from "@/lib/popular-links";

/**
 * Compact in-page link strip for popular tags (home above the grid) or
 * tags+pornstars hubs (footer). Gives crawlers dense internal linking.
 */
export default function PopularLinksStrip({
  title,
  links,
  hrefPrefix,
  className = "",
}: {
  title: string;
  links: PopularLink[];
  hrefPrefix: "/tags" | "/pornstars";
  className?: string;
}) {
  if (links.length === 0) return null;

  return (
    <nav aria-label={title} className={className}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.slug}>
            <Link
              href={`${hrefPrefix}/${link.slug}`}
              className="inline-block max-w-full break-words rounded-full border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs text-zinc-300 hover:border-brand-500/40 hover:text-brand-300"
            >
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
