import Link from "next/link";

const links = [
  { href: "/admin/assistant", label: "Assistant" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/contexts", label: "Contexts" },
  { href: "/admin/tools", label: "Tools" },
  { href: "/admin/skills", label: "Skills" },
  { href: "/admin/chats", label: "Chats" },
];

export default function AssistantNav({ active }: { active?: string }) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-800 pb-4 text-sm">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            active === l.href
              ? "font-medium text-brand-400"
              : "text-zinc-400 hover:text-zinc-200"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
