import { prisma } from "@/lib/db";

type IncomingAttachment = {
  url?: string;
  contentType?: string;
  name?: string;
};

type IncomingPart = {
  type?: string;
  text?: string;
  url?: string;
  mediaType?: string;
  image?: string;
};

type IncomingMessage = {
  id?: string;
  role?: string;
  content?: string | IncomingPart[];
  parts?: IncomingPart[];
  experimental_attachments?: IncomingAttachment[];
};

function getMessageText(m: IncomingMessage): string {
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) {
    return m.content
      .map((p) => (p?.type === "text" ? p.text || "" : ""))
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(m.parts)) {
    return m.parts
      .map((p) => (p?.type === "text" ? p.text || "" : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function getAttachmentsForStore(m: IncomingMessage): Array<{ url: string; contentType?: string; name?: string }> {
  const fromAttachments = (m.experimental_attachments || [])
    .filter((a) => !!a?.url)
    .map((a) => ({ url: String(a.url), contentType: a.contentType, name: a.name }));

  const fromParts = (m.parts || [])
    .filter((p) => (p?.type === "file" || p?.type === "image") && !!p?.url)
    .map((p) => ({
      url: String(p.url),
      contentType: p.mediaType,
      name: p.url?.split("/").pop(),
    }));

  const fromContentParts = Array.isArray(m.content)
    ? m.content
        .filter((p) => p?.type === "image" && !!p?.image)
        .map((p) => ({
          url: String(p.image),
          contentType: "image/png",
          name: "image.png",
        }))
    : [];

  const dedup = new Map<string, { url: string; contentType?: string; name?: string }>();
  for (const item of [...fromAttachments, ...fromParts, ...fromContentParts]) {
    if (!dedup.has(item.url)) dedup.set(item.url, item);
  }
  return Array.from(dedup.values());
}

export async function syncChatThread(
  threadId: string,
  title: string,
  messages: IncomingMessage[]
) {
  await prisma.$transaction(async (tx) => {
    await tx.chatThread.upsert({
      where: { id: threadId },
      update: { title },
      create: { id: threadId, title },
    });

    await tx.chatAttachment.deleteMany({
      where: { message: { threadId } },
    });
    await tx.chatMessage.deleteMany({ where: { threadId } });

    for (const m of messages) {
      const id = String(m.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      const role = String(m.role || "assistant");
      const content = getMessageText(m);
      const attachments = getAttachmentsForStore(m);
      await tx.chatMessage.create({
        data: {
          id,
          threadId,
          role,
          content,
          attachments: {
            create: attachments.map((a) => ({
              url: a.url,
              contentType: a.contentType || null,
              name: a.name || null,
            })),
          },
        },
      });
    }
  });
}

export async function getChatThread(threadId: string) {
  return prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { attachments: true },
      },
    },
  });
}

export async function searchChatThreads(query?: string) {
  const q = String(query || "").trim();

  if (!q) {
    const rows = await prisma.chatThread.findMany({
      orderBy: { updatedAt: "desc" },
      take: 80,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt,
      preview: r.messages[0]?.content?.slice(0, 180) || "",
      matchType: "none" as const,
    }));
  }

  // Query 1: threads whose title matches.
  const titleMatches = await prisma.chatThread.findMany({
    where: { title: { contains: q } },
    orderBy: { updatedAt: "desc" },
    take: 80,
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const titleMatchIds = new Set(titleMatches.map((r) => r.id));

  // Query 2: threads that match only in messages (title didn't match).
  // We fetch matching messages so we can surface the relevant snippet.
  const messageMatchThreads = await prisma.chatThread.findMany({
    where: {
      title: { not: { contains: q } },
      messages: { some: { content: { contains: q } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
    include: {
      // Grab the last message for the preview, plus one matching message for the snippet.
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  // For message-match threads, fetch the first matching message snippet separately.
  const messageMatchIds = messageMatchThreads
    .map((r) => r.id)
    .filter((id) => !titleMatchIds.has(id));

  const matchingMessages =
    messageMatchIds.length > 0
      ? await prisma.chatMessage.findMany({
          where: {
            threadId: { in: messageMatchIds },
            content: { contains: q },
          },
          orderBy: { createdAt: "asc" },
          distinct: ["threadId"],
          select: { threadId: true, content: true },
        })
      : [];

  const snippetByThread = new Map(matchingMessages.map((m) => [m.threadId, m.content]));

  const titleResults = titleMatches.map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt,
    preview: r.messages[0]?.content?.slice(0, 180) || "",
    matchType: "title" as const,
  }));

  const messageResults = messageMatchThreads
    .filter((r) => !titleMatchIds.has(r.id))
    .map((r) => {
      const snippet = snippetByThread.get(r.id) || r.messages[0]?.content || "";
      return {
        id: r.id,
        title: r.title,
        updatedAt: r.updatedAt,
        preview: snippet.slice(0, 180),
        matchType: "message" as const,
      };
    });

  return [...titleResults, ...messageResults];
}
