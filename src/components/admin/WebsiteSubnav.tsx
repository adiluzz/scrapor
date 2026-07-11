import Link from "next/link";

const tabs = [
  { key: "identity", label: "Identity", href: (id: string) => `/admin/websites/${id}` },
  { key: "seo", label: "SEO", href: (id: string) => `/admin/websites/${id}/seo` },
  { key: "ads", label: "Ads", href: (id: string) => `/admin/websites/${id}/ads` },
] as const;

export default function WebsiteSubnav({
  siteId,
  active,
}: {
  siteId: string;
  active: "identity" | "seo" | "ads";
}) {
  return (
    <nav className="mt-4 mb-6 flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href(siteId)}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            active === t.key
              ? "bg-zinc-800 font-medium text-white"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
