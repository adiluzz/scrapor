import { prisma } from "@/lib/db";

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
