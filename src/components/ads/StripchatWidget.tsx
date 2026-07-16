"use client";

function resolveStripchatWidgetSrc(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (value.startsWith("https://") || value.startsWith("http://")) return value;
  return `https://go.mavrck.co/widget/${encodeURIComponent(value)}`;
}

function isStripchatWidgetUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === "go.mavrck.co" && pathname.startsWith("/widget/")) return true;
    if (hostname.endsWith("whitetrafsa.com") && pathname.includes("/widgets/")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Stripchat cam affiliate — widget iframe when widget id/url is set, else sponsored link.
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
  const url = affiliateUrl?.trim();
  const widgetSrc =
    resolveStripchatWidgetSrc(widgetId) ??
    (url && isStripchatWidgetUrl(url) ? url : null);
  if (!widgetSrc && !url) return null;

  return (
    <aside className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Live cams</p>
      {widgetSrc ? (
        <iframe
          title="Stripchat live cams"
          src={widgetSrc}
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
