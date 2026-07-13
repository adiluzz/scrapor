import { prisma } from "@/lib/db";
import {
  downloadTpdbImage,
  findTpdbPerformer,
  isTpdbConfigured,
  pickBestTpdbImage,
  searchTpdbPerformers,
  type TpdbPerformer,
} from "@/lib/theporndb";
import { savePornstarImage } from "@/lib/pornstar-image-store";
import { tpdbPerformerToPornstarData } from "@/lib/tpdb-pornstar-sync";
import { logger } from "@/lib/logger";

export type EnrichPornstarOptions = {
  tpdbId?: string;
  imageUrl?: string;
  imageId?: string;
  /** When true, skip image download (metadata only). Default false. */
  skipImage?: boolean;
};

export type EnrichPornstarResult = {
  ok: true;
  tpdbId: string;
  tpdbName: string;
  metadataSynced: true;
  imageSaved: boolean;
  syncedAt: Date | null;
};

export type EnrichPornstarFailure = {
  ok: false;
  error: string;
  status: number;
};

/** Resolve a TPDB performer by id or name search (exact match preferred). */
export async function resolveTpdbPerformer(
  name: string,
  tpdbId?: string
): Promise<TpdbPerformer | null> {
  if (tpdbId) {
    const byId = await findTpdbPerformer(tpdbId);
    if (byId) return byId;
  }
  const matches = await searchTpdbPerformers(name);
  const exact = matches.find((p) => p.name.toLowerCase() === name.toLowerCase());
  return exact ?? matches[0] ?? null;
}

/**
 * Sync a pornstar row from ThePornDB (profile fields + best/selected image).
 * Returns a structured failure instead of throwing for common "not found" cases.
 */
export async function enrichPornstarFromTpdb(
  pornstarId: string,
  options: EnrichPornstarOptions = {}
): Promise<EnrichPornstarResult | EnrichPornstarFailure> {
  if (!isTpdbConfigured()) {
    return {
      ok: false,
      error: "ThePornDB API key not configured — set TPDB_API_KEY in environment",
      status: 503,
    };
  }

  const star = await prisma.pornstar.findUnique({
    where: { id: pornstarId },
    select: { id: true, siteId: true, name: true },
  });
  if (!star) {
    return { ok: false, error: "Not found", status: 404 };
  }

  try {
    const performer = await resolveTpdbPerformer(star.name, options.tpdbId?.trim() || undefined);
    if (!performer) {
      return {
        ok: false,
        error: `No performer found on ThePornDB for "${star.name}"`,
        status: 404,
      };
    }

    const updated = await prisma.pornstar.update({
      where: { id: star.id },
      data: tpdbPerformerToPornstarData(performer),
    });

    let imageSaved = false;
    if (!options.skipImage) {
      const imageUrl = options.imageUrl?.trim() || "";
      const imageId = options.imageId?.trim() || "";
      let image = null;
      if (imageUrl || imageId) {
        image =
          performer.images.find(
            (img) => (imageUrl && img.url === imageUrl) || (imageId && img.id === imageId)
          ) ?? null;
        if (!image) {
          return { ok: false, error: "Selected image not found on this performer", status: 400 };
        }
      } else {
        image = pickBestTpdbImage(performer.images);
      }
      if (image?.url) {
        const { buffer, contentType } = await downloadTpdbImage(image.url);
        await savePornstarImage(star.siteId, star.id, buffer, contentType);
        imageSaved = true;
      }
    }

    return {
      ok: true,
      tpdbId: performer.id,
      tpdbName: performer.name,
      metadataSynced: true,
      imageSaved,
      syncedAt: updated.tpdbSyncedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    logger.warn({ err: message, pornstarId }, "tpdb enrich failed");
    return { ok: false, error: message, status: 500 };
  }
}

/** Fire-and-forget enrich for newly created pornstars (never throws). */
export function enrichPornstarFromTpdbInBackground(pornstarId: string): void {
  if (!isTpdbConfigured()) return;
  void enrichPornstarFromTpdb(pornstarId).then((result) => {
    if (!result.ok) {
      logger.warn(
        { pornstarId, error: result.error, status: result.status },
        "background tpdb enrich failed"
      );
    } else {
      logger.info(
        { pornstarId, tpdbId: result.tpdbId, imageSaved: result.imageSaved },
        "background tpdb enrich ok"
      );
    }
  });
}
