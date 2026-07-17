import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/api-access";
import { isSessionAuth } from "@/lib/api-access";

/** Ensure a detection is listed on Ad clips (approved feedback). Idempotent. */
export async function approveDetectionForAdClips(
  detectionId: string,
  userId: string | null | undefined
): Promise<void> {
  const uid = userId || "system";
  await prisma.videoAgentFeedback.upsert({
    where: { detectionId },
    create: {
      detectionId,
      approved: true,
      userId: uid,
    },
    update: {
      approved: true,
      userId: uid,
    },
  });
}

export async function approveDetectionsForAdClips(
  detectionIds: string[],
  userId: string | null | undefined
): Promise<void> {
  for (const id of detectionIds) {
    await approveDetectionForAdClips(id, userId);
  }
}

/** Session admins see clips from all sites unless `siteId` is set; API keys stay site-scoped. */
export function adClipsSiteWhere(
  auth: AuthContext,
  siteIdParam?: string | null
): { run?: { siteId: string } } {
  const siteId = siteIdParam?.trim();
  if (siteId) return { run: { siteId } };
  if (isSessionAuth(auth) && auth.role === "ADMIN") return {};
  return { run: { siteId: auth.siteId } };
}
