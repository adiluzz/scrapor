import Link from "next/link";
import type { Site } from "@prisma/client";
import GoldenDrop from "@/components/brand/GoldenDrop";
import FbbMark from "@/components/brand/FbbMark";
import SharlilaMark from "@/components/brand/SharlilaMark";

type LogoProps = {
  site?: Pick<Site, "name" | "logoKey" | "primaryColor"> | null;
  /** Show "admin" suffix (sidebar). */
  admin?: boolean;
  /** Link to home; set false for static branding on auth pages. */
  href?: string | false;
  className?: string;
};

function SiteMark({
  logoKey,
  primaryColor,
  id,
  className,
}: {
  logoKey?: string | null;
  primaryColor?: string | null;
  id: string;
  className?: string;
}) {
  const color = primaryColor || "#D4AF37";
  if (logoKey === "fbb-mark") {
    return <FbbMark className={className || "h-9 w-9 shrink-0"} id={id} color={color} />;
  }
  if (logoKey === "sharlila-mark") {
    return <SharlilaMark className={className || "h-9 w-9 shrink-0"} id={id} color={color} />;
  }
  return <GoldenDrop className={className || "h-9 w-9 shrink-0"} id={id} />;
}

function splitName(name: string): { left: string; right: string } {
  const n = name.trim();
  if (n.toLowerCase() === "pisster") return { left: "piss", right: "ter" };
  if (n.toLowerCase() === "fbb tube") return { left: "FBB", right: " Tube" };
  const parts = n.split(/\s+/);
  if (parts.length >= 2) {
    return { left: parts[0], right: " " + parts.slice(1).join(" ") };
  }
  const mid = Math.ceil(n.length / 2);
  return { left: n.slice(0, mid), right: n.slice(mid) };
}

export default function Logo({
  site,
  admin = false,
  href = "/",
  className = "",
}: LogoProps) {
  const name = site?.name || "Pisster";
  const { left, right } = splitName(name);
  const accent = site?.primaryColor || "#D4AF37";

  const inner = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SiteMark
        logoKey={site?.logoKey}
        primaryColor={site?.primaryColor}
        id={admin ? "admin" : "header"}
      />
      <span className="text-2xl font-black tracking-tight leading-none">
        <span className="text-white">{left}</span>
        <span style={{ color: accent }}>{right}</span>
      </span>
      {admin && (
        <span className="ml-0.5 self-end pb-0.5 text-xs font-normal text-zinc-500">admin</span>
      )}
    </span>
  );

  if (href === false) return inner;
  return (
    <Link
      href={href}
      className="shrink-0 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
    >
      {inner}
    </Link>
  );
}

/** Drop-only mark for compact spaces. */
export function LogoMark({
  className = "h-8 w-8",
  logoKey,
  primaryColor,
}: {
  className?: string;
  logoKey?: string | null;
  primaryColor?: string | null;
}) {
  return (
    <SiteMark logoKey={logoKey} primaryColor={primaryColor} id="mark" className={className} />
  );
}
