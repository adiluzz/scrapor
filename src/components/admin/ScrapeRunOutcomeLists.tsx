function OutcomeList({
  title,
  items,
  emptyLabel,
  tone,
}: {
  title: string;
  items: Array<{
    url: string;
    title: string | null;
    sourceSite: string | null;
    reason: string;
    stage: string | null;
  }>;
  emptyLabel: string;
  tone: "skip" | "fail";
}) {
  const border = tone === "fail" ? "border-red-900/40" : "border-zinc-800";
  const reasonClass = tone === "fail" ? "text-red-300/80" : "text-zinc-500";

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-white">
        {title} ({items.length})
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <ul className={`divide-y divide-zinc-800 rounded-xl border ${border}`}>
          {items.map((item) => (
            <li key={item.url} className="px-4 py-3 text-sm">
              <p className="font-medium text-zinc-200">{item.title || "Untitled"}</p>
              <p className={`mt-1 ${reasonClass}`}>{item.reason}</p>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
                {item.sourceSite && <span>{item.sourceSite}</span>}
                {item.stage && <span>stage: {item.stage}</span>}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-zinc-500 underline hover:text-zinc-300"
                >
                  {item.url}
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ScrapeRunOutcomeLists({
  skipped,
  failed,
  runStatus,
}: {
  skipped: Array<{
    url: string;
    title: string | null;
    sourceSite: string | null;
    reason: string;
    stage: string | null;
  }>;
  failed: Array<{
    url: string;
    title: string | null;
    sourceSite: string | null;
    reason: string;
    stage: string | null;
  }>;
  runStatus?: string;
}) {
  const inProgress = runStatus === "RUNNING" || runStatus === "QUEUED";
  const pendingNote = inProgress
    ? "Videos still processing — skipped/failed entries appear here as each one finishes."
    : null;

  return (
    <>
      {pendingNote && <p className="text-sm text-zinc-500">{pendingNote}</p>}
      <OutcomeList
        title="Skipped videos"
        items={skipped}
        emptyLabel={
          inProgress ? "None skipped yet." : "No skipped videos recorded."
        }
        tone="skip"
      />
      <OutcomeList
        title="Failed videos"
        items={failed}
        emptyLabel={inProgress ? "None failed yet." : "No failed videos recorded."}
        tone="fail"
      />
    </>
  );
}
