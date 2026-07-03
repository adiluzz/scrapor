import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardApiRoute, isSessionAuth } from "@/lib/admin-guard";

const MAX_BUCKETS = 2000;

/**
 * Record watched segments. Increments the per-video aggregate heatmap and, for
 * logged-in users, upserts their personal progress. Accepts sendBeacon text.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guardApiRoute(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  let payload: { buckets?: number[]; positionSec?: number; bucketCount?: number };
  try {
    const text = await request.text();
    payload = JSON.parse(text || "{}");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const watched = Array.isArray(payload.buckets)
    ? payload.buckets.filter((n) => Number.isInteger(n) && n >= 0 && n < MAX_BUCKETS)
    : [];
  if (watched.length === 0) return NextResponse.json({ ok: true });

  const size = Math.min(MAX_BUCKETS, Math.max(payload.bucketCount || 0, ...watched.map((b) => b + 1)));

  const existing = await prisma.videoHeatmap.findUnique({ where: { videoId: id } });
  const agg: number[] = existing ? (JSON.parse(existing.buckets) as number[]) : [];
  while (agg.length < size) agg.push(0);
  for (const b of watched) agg[b] = (agg[b] || 0) + 1;

  await prisma.videoHeatmap.upsert({
    where: { videoId: id },
    update: { buckets: JSON.stringify(agg) },
    create: { videoId: id, buckets: JSON.stringify(agg) },
  });

  const user = isSessionAuth(auth) ? auth : null;
  if (user) {
    const prev = await prisma.watchProgress.findUnique({
      where: { userId_videoId: { userId: user.userId, videoId: id } },
    });
    const set = new Set<number>(prev ? (JSON.parse(prev.buckets) as number[]) : []);
    for (const b of watched) set.add(b);
    await prisma.watchProgress.upsert({
      where: { userId_videoId: { userId: user.userId, videoId: id } },
      update: {
        positionSec: payload.positionSec ?? prev?.positionSec ?? 0,
        buckets: JSON.stringify(Array.from(set).sort((a, b) => a - b)),
      },
      create: {
        userId: user.userId,
        videoId: id,
        positionSec: payload.positionSec ?? 0,
        buckets: JSON.stringify(watched),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
