import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const [tags, pornstars, categories] = await Promise.all([
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, icon: true },
    }),
    prisma.pornstar.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  // Deduplicate pornstar names for autocomplete (same person may exist per site).
  const seenStars = new Set<string>();
  const uniquePornstars = pornstars.filter((p) => {
    const key = p.name.toLowerCase();
    if (seenStars.has(key)) return false;
    seenStars.add(key);
    return true;
  });

  const seenTags = new Set<string>();
  const uniqueTags = tags.filter((t) => {
    const key = t.name.toLowerCase();
    if (seenTags.has(key)) return false;
    seenTags.add(key);
    return true;
  });

  const seenCats = new Set<string>();
  const uniqueCategories = categories.filter((c) => {
    const key = c.name.toLowerCase();
    if (seenCats.has(key)) return false;
    seenCats.add(key);
    return true;
  });

  return NextResponse.json({
    tags: uniqueTags,
    pornstars: uniquePornstars,
    categories: uniqueCategories,
  });
}
