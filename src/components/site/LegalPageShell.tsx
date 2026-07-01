import Link from "next/link";

type Props = {
  title: string;
  siteName: string;
  children: React.ReactNode;
};

export default function LegalPageShell({ title, siteName, children }: Props) {
  return (
    <article className="mx-auto max-w-3xl">
      <p className="text-sm text-zinc-500">
        <Link href="/" className="hover:text-zinc-300">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span>{title}</span>
      </p>
      <h1 className="mt-3 text-3xl font-bold text-white">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: 1 July 2026 · {siteName}</p>
      <div className="mt-8 space-y-8 text-sm leading-relaxed text-zinc-300 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_a]:text-pink-400 [&_a]:underline [&_a:hover]:text-pink-300 [&_strong]:font-semibold [&_strong]:text-zinc-100">
        {children}
      </div>
    </article>
  );
}
