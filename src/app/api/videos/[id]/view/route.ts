import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

/** Increment viewCount at most once per (ip, video) per hour. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip =
    _request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    _request.headers.get("x-real-ip") ||
    "0.0.0.0";
  try {
    const key = `view:${id}:${ip}`;
    const first = await redis.set(key, "1", "EX", 3600, "NX");
    if (first === null) return NextResponse.json({ ok: true, counted: false });
  } catch {
    /* if redis down, still count */
  }
  await prisma.video.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
  return NextResponse.json({ ok: true, counted: true });
}
