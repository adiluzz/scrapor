import { prisma } from "@/lib/db";

export async function recordFeedbackTraining(
  detectionId: string,
  approved: boolean,
  userId: string,
  siteId: string
) {
  const detection = await prisma.videoAgentDetection.findUnique({
    where: { id: detectionId },
    include: { run: true },
  });
  if (!detection) throw new Error("Detection not found");

  await prisma.$transaction([
    prisma.videoAgentFeedback.upsert({
      where: { detectionId },
      create: { detectionId, approved, userId },
      update: { approved, userId },
    }),
    prisma.videoAgentTrainingExample.create({
      data: {
        siteId,
        label: detection.label,
        approved,
        startSec: detection.startSec,
        endSec: detection.endSec,
        screenX: detection.screenX,
        screenY: detection.screenY,
        screenW: detection.screenW,
        screenH: detection.screenH,
        contextPrompt: detection.run.userPrompt,
        videoId: detection.videoId,
        sourceDetectionId: detection.id,
      },
    }),
  ]);
}
