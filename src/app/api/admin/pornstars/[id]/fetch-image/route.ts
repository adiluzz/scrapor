import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import {
  downloadTpdbImage,
  findTpdbPerformer,
  isTpdbConfigured,
  pickBestTpdbImage,
  searchTpdbPerformers,
} from "@/lib/theporndb";
import { savePornstarImage } from "@/lib/pornstar-image-store";
import { pornstarImageUrl } from "@/lib/pornstar-image";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  if (!isTpdbConfigured()) {
    return NextResponse.json(
      { error: "ThePornDB API key not configured — set TPDB_API_KEY in environment" },
      { status: 503 }
    );
  }

  const star = await prisma.pornstar.findFirst({
    where: { id, siteId: auth.siteId },
    select: { id: true, siteId: true, name: true },
  });
  if (!star) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const tpdbId = typeof body.tpdbId === "string" ? body.tpdbId.trim() : "";

  try {
    let performer = tpdbId ? await findTpdbPerformer(tpdbId) : null;

    if (!performer) {
      const matches = await searchTpdbPerformers(star.name);
      const exact = matches.find(
        (p) => p.name.toLowerCase() === star.name.toLowerCase()
      );
      performer = exact ?? matches[0] ?? null;
    }

    if (!performer) {
      return NextResponse.json(
        { error: `No performer with images found on ThePornDB for "${star.name}"` },
        { status: 404 }
      );
    }

    const image = pickBestTpdbImage(performer.images);
    if (!image?.url) {
      return NextResponse.json({ error: "Performer has no usable images" }, { status: 404 });
    }

    const { buffer, contentType } = await downloadTpdbImage(image.url);
    await savePornstarImage(star.siteId, star.id, buffer, contentType);

    return NextResponse.json({
      ok: true,
      source: "theporndb",
      tpdbId: performer.id,
      tpdbName: performer.name,
      imageUrl: `/media/pornstar/${star.id}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
