import { NextResponse } from "next/server";
import { z } from "zod";
import { createSubreddit } from "@/lib/reddit";
import { guardRedditRoute, redditErrorResponse } from "@/lib/reddit-admin";

const schema = z.object({
  name: z
    .string()
    .min(3)
    .max(21)
    .regex(/^[A-Za-z0-9_]+$/, "Name must be letters, numbers, or underscore"),
  title: z.string().min(1).max(100),
  publicDescription: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
  type: z.enum(["public", "restricted", "private"]).optional(),
  over18: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gated = await guardRedditRoute(request, id);
  if ("error" in gated && gated.error) return gated.error;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const community = await createSubreddit(gated.creds!, parsed.data);
    return NextResponse.json({ ok: true, community });
  } catch (err) {
    return redditErrorResponse(err);
  }
}
