type CatalogModel = {
  name: string;
  size: number;
  modified_at?: string;
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const limitRaw = Number(url.searchParams.get("limit") || "0");
    const limit = Number.isFinite(limitRaw) ? Math.max(Math.floor(limitRaw), 0) : 0;

    const res = await fetch("https://ollama.com/api/tags", {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: text || "Failed to fetch catalog" }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(text) as { models?: Array<{ name?: string; size?: number; modified_at?: string }> };
    const sourceModels: CatalogModel[] = (parsed.models || [])
      .map((m) => ({
        name: String(m.name || "").trim(),
        size: Number(m.size || 0),
        modified_at: m.modified_at,
      }))
      .filter((m) => !!m.name);

    // Remove duplicates by model name.
    const dedupMap = new Map<string, CatalogModel>();
    for (const m of sourceModels) {
      if (!dedupMap.has(m.name)) dedupMap.set(m.name, m);
    }
    let models = Array.from(dedupMap.values());
    models.sort((a, b) => a.name.localeCompare(b.name));

    if (q) {
      models = models.filter((m) => m.name.toLowerCase().includes(q));
    }
    if (limit > 0) {
      models = models.slice(0, limit);
    }

    return Response.json({
      models,
      total: models.length,
      sourceTotal: sourceModels.length,
      dedupedTotal: dedupMap.size,
      limited: limit > 0,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to fetch catalog" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

