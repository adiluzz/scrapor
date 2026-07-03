import { prisma } from "@/lib/db";

const DEFAULT_AGENT = {
  id: "agent_content_detector",
  key: "content-detector",
  name: "Content Detector",
  description:
    "Searches videos and detects specific on-screen events with timestamps and screen regions.",
  defaultPrompt:
    "Search for videos related to golden shower content. Detect exactly where piss drinking happens and where piss swallowing happens. Return the time range and screen location for each occurrence.",
};

/** Ensure the default agent row exists (idempotent after migrations). */
export async function ensureDefaultVideoAgent() {
  return prisma.videoAgent.upsert({
    where: { key: DEFAULT_AGENT.key },
    update: {},
    create: DEFAULT_AGENT,
  });
}
