import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/** Legacy /watch/{id} → new /videos/{slug} clean URL. */
export default async function WatchRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await prisma.video.findUnique({ where: { id }, select: { slug: true } });
  redirect(video ? `/videos/${video.slug}` : "/");
}
