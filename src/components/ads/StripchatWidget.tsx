"use client";

/**
 * Stripchat cam affiliate — widget iframe when widgetId is set, else sponsored link.
 */
export default function StripchatWidget({
  widgetId,
  affiliateUrl,
  enabled = true,
}: {
  widgetId?: string | null;
  affiliateUrl?: string | null;
  enabled?: boolean;
}) {
  if (!enabled) return null;
  const id = widgetId?.trim();
  const url = affiliateUrl?.trim();
  if (!id && !url) return null;

  return (
    <aside className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Live cams</p>
      {id ? (
        <iframe
          title="Stripchat live cams"
          src={`https://go.mavrck.co/widget/${encodeURIComponent(id)}`}
          className="h-[280px] w-full max-w-full rounded-lg border-0 bg-zinc-950"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      ) : (
        <a
          href={url!}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="block rounded-lg bg-pink-600/20 px-4 py-6 text-center text-sm font-medium text-pink-300 hover:bg-pink-600/30"
        >
          Watch live cams on Stripchat →
        </a>
      )}
    </aside>
  );
}
