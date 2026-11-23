import type { Prisma } from "@prisma/client";

export type AdminVideoSuspensionFilter = "" | "visible" | "suspended";

export function parseAdminSuspensionFilter(raw: string): AdminVideoSuspensionFilter {
  if (raw === "visible" || raw === "suspended") return raw;
  return "";
}

/** Admin video list filters. Suspension never drops the publication row. */
export function adminVideoListWhere(input: {
  q?: string;
  siteId?: string;
  orphans?: boolean;
  suspension?: AdminVideoSuspensionFilter;
}): Prisma.VideoWhereInput {
  const q = input.q?.trim() || "";
  const siteId = input.siteId?.trim() || "";
  const suspension = input.suspension || "";
  const where: Prisma.VideoWhereInput = {};
  if (q) where.title = { contains: q, mode: "insensitive" };
  if (input.orphans) {
    where.sites = { none: {} };
    return where;
  }
  if (suspension === "suspended") {
    where.sites = { some: siteId ? { siteId, suspended: true } : { suspended: true } };
  } else if (suspension === "visible") {
    where.sites = { some: siteId ? { siteId, suspended: false } : { suspended: false } };
  } else if (siteId) {
    where.sites = { some: { siteId } };
  }
  return where;
}
