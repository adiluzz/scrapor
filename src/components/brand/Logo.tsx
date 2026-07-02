import Link from "next/link";
import GoldenDrop from "@/components/brand/GoldenDrop";

type LogoProps = {
  /** Show "admin" suffix (sidebar). */
  admin?: boolean;
  /** Link to home; set false for static branding on auth pages. */
  href?: string | false;
  className?: string;
};

export default function Logo({ admin = false, href = "/", className = "" }: LogoProps) {
  const inner = (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <GoldenDrop className="h-9 w-9 shrink-0" id={admin ? "admin" : "header"} />
      <span className="text-2xl font-black tracking-tight leading-none">
        <span className="text-white">piss</span>
        <span className="text-brand-400">ter</span>
      </span>
      {admin && (
        <span className="ml-0.5 self-end pb-0.5 text-xs font-normal text-zinc-500">admin</span>
      )}
    </span>
  );

  if (href === false) return inner;
  return (
    <Link href={href} className="shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded-sm">
      {inner}
    </Link>
  );
}

/** Drop-only mark for compact spaces. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return <GoldenDrop className={className} id="mark" />;
}
