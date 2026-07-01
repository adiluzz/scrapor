"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAssistantChat } from "@/lib/use-assistant-chat";

type ChatAttachment = { url?: string; contentType?: string; name?: string };
type ChatPart = { type?: string; text?: string; url?: string; mediaType?: string; image?: string };
type ChatMessageLike = {
  id: string;
  role: string;
  content?: string | Array<{ type?: string; text?: string; image?: string }>;
  parts?: ChatPart[];
  experimental_attachments?: ChatAttachment[];
};

type ContextOption = {
  id: string;
  name: string;
};

function makeChatId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shortenTitle(input: string): string {
  const t = input.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

function toArrayUnique(values: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

function toImageSrc(urlOrPath: string): string {
  if (urlOrPath.startsWith("data:") || urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) return urlOrPath;
  if (urlOrPath.startsWith("library/")) return `/api/library-image?path=${encodeURIComponent(urlOrPath)}`;
  return urlOrPath;
}

function toStorableMessage(m: ChatMessageLike): ChatMessageLike {
  return {
    id: m.id,
    role: m.role,
    content: getMessageText(m),
    experimental_attachments: (m.experimental_attachments || [])
      .filter((a) => !!a?.url && !String(a.url).startsWith("data:"))
      .slice(0, 6)
      .map((a) => ({ url: a.url as string, contentType: a.contentType, name: a.name })),
  };
}

function getMessageText(m: ChatMessageLike): string {
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) return m.content.map((p) => (p?.type === "text" ? p.text || "" : "")).filter(Boolean).join("\n");
  if (Array.isArray(m.parts)) return m.parts.map((p) => (p?.type === "text" ? p.text || "" : "")).filter(Boolean).join("\n");
  return "";
}

function getAttachedImagesForMessage(m: ChatMessageLike): string[] {
  const fromAttachments = (m.experimental_attachments || []).filter((a) => a?.url && a?.contentType?.startsWith("image/")).map((a) => a.url);
  const fromParts = (m.parts || []).filter((p) => (p?.type === "file" || p?.type === "image") && !!p?.url && (!!p?.mediaType ? p.mediaType.startsWith("image/") : true)).map((p) => p.url);
  const fromContentParts = Array.isArray(m.content) ? m.content.filter((p) => p?.type === "image" && !!p?.image).map((p) => p.image) : [];
  return toArrayUnique([...fromAttachments, ...fromParts, ...fromContentParts]);
}

function getAttachmentsForResend(m: ChatMessageLike): Array<{ url: string; contentType?: string; name?: string }> {
  const fromAttachments = (m.experimental_attachments || []).filter((a) => !!a?.url).map((a) => ({ url: a.url as string, contentType: a.contentType, name: a.name }));
  const fromParts = (m.parts || []).filter((p) => (p?.type === "file" || p?.type === "image") && !!p?.url).map((p) => ({ url: p.url as string, contentType: p.mediaType, name: p.url?.split("/").pop() }));
  const fromContentParts = Array.isArray(m.content) ? m.content.filter((p) => p?.type === "image" && !!p?.image).map((p) => ({ url: p.image as string, contentType: "image/png", name: "image.png" })) : [];
  const dedup = new Map<string, { url: string; contentType?: string; name?: string }>();
  for (const item of [...fromAttachments, ...fromParts, ...fromContentParts]) {
    if (!dedup.has(item.url)) dedup.set(item.url, item);
  }
  return Array.from(dedup.values());
}

function getAssistantImagePaths(text: string): string[] {
  const markerMatches = Array.from(text.matchAll(/IMAGE:\s*(library\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi)).map((m) => m[1]);
  const pathMatches = Array.from(text.matchAll(/(library\/(?:assistant|mcp)-screenshots\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi)).map((m) => m[1]);
  return toArrayUnique([...markerMatches, ...pathMatches]);
}

function stripImageMetaLines(text: string): string {
  return text.split("\n").filter((line) => !/^\s*(IMAGE|CAPTION):/i.test(line)).join("\n").trim();
}

export default function AssistantChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = String(params.id || "");

  const [initialMessages, setInitialMessages] = useState<ChatMessageLike[]>([]);
  const [chatTitle, setChatTitle] = useState("New Chat");
  const [contexts, setContexts] = useState<ContextOption[]>([]);
  const [activeContextId, setActiveContextId] = useState("");
  const [loadingContexts, setLoadingContexts] = useState(false);
  const [savingContextId, setSavingContextId] = useState(false);
  const [chatStatus, setChatStatus] = useState({ modelName: "", isLoading: false, elapsedSeconds: 0 });
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [chatModelName, setChatModelName] = useState("");
  const [chatModelHasVision, setChatModelHasVision] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [hasTitled, setHasTitled] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing thread from DB on mount
  useEffect(() => {
    if (!chatId) return;
    (async () => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          const thread = json.thread as { id: string; title: string } | undefined;
          const msgs = Array.isArray(json.messages) ? (json.messages as ChatMessageLike[]) : [];
          if (thread?.title && !thread.title.startsWith("New Chat")) {
            setChatTitle(thread.title);
            setHasTitled(true);
          }
          setInitialMessages(msgs);
        }
      } catch {
        // fresh chat — no messages yet
      } finally {
        setMessagesLoaded(true);
      }
    })();
  }, [chatId]);

  // Update browser tab title whenever chatTitle changes
  useEffect(() => {
    document.title = chatTitle === "New Chat" ? "Assistant | Scrapor" : `${chatTitle} | Scrapor`;
  }, [chatTitle]);

  // Load context options and model capabilities
  useEffect(() => {
    setLoadingContexts(true);
    (async () => {
      try {
        const [ctxRes, settingsRes, modelsRes] = await Promise.all([
          fetch("/api/contexts", { cache: "no-store" }),
          fetch("/api/assistant-settings", { cache: "no-store" }),
          fetch("/api/admin/bedrock/models"),
        ]);
        const ctxJson = await ctxRes.json();
        const settingsJson = await settingsRes.json();
        const modelsJson = await modelsRes.json();

        const loadedContexts: ContextOption[] = Array.isArray(ctxJson?.contexts)
          ? ctxJson.contexts
              .map((c: { id?: string; name?: string }) => ({ id: String(c.id || ""), name: String(c.name || "") }))
              .filter((c: ContextOption) => c.id && c.name)
          : [];
        setContexts(loadedContexts);
        const currentId = String(settingsJson?.settings?.activeContextId || "");
        setActiveContextId(currentId || (loadedContexts[0]?.id ?? ""));

        const selectedModel = String(settingsJson?.settings?.model || "").trim();
        const models = Array.isArray(modelsJson?.models) ? modelsJson.models : [];
        const found = models.find((m: { id?: string }) => m?.id === selectedModel) as { hasVision?: boolean } | undefined;
        setChatModelName(selectedModel);
        setChatModelHasVision(found?.hasVision !== false);
        if (found?.hasVision === false) setFiles([]);
      } catch {
        setChatModelName("");
        setChatModelHasVision(true);
      } finally {
        setLoadingContexts(false);
      }
    })();
  }, []);

  const updateActiveContext = async (contextId: string) => {
    const id = String(contextId || "").trim();
    setSavingContextId(true);
    setActiveContextId(id);
    try {
      await fetch("/api/assistant-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activeContextId: id }) });
    } catch { /* non-fatal */ } finally { setSavingContextId(false); }
  };

  const {
    messages,
    input,
    setInput,
    handleSubmit: useChatSubmit,
    isLoading,
    stop,
    error,
    setMessages,
    append,
  } = useAssistantChat({
    id: chatId,
    initialMessages: initialMessages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      content: getMessageText(m),
      experimental_attachments: (m.experimental_attachments || [])
        .filter((a): a is { url: string; contentType?: string; name?: string } => !!a?.url)
        .map((a) => ({ url: a.url, contentType: a.contentType, name: a.name })),
    })),
    api: "/api/assistant",
    body: { activeContextId },
    onResponse: () => setLiveLogs((p) => [`Request accepted (${new Date().toLocaleTimeString()})`, ...p].slice(0, 20)),
    onFinish: () => setLiveLogs((p) => [`Response finished (${new Date().toLocaleTimeString()})`, ...p].slice(0, 20)),
    onError: (err) => {
      console.error("[assistant]", err);
      setLiveLogs((p) => [`Error: ${err.message}`, ...p].slice(0, 20));
      setMessages((prev) => {
        const fallback = `I could not get a model reply (${err.message}). Please try again or switch models in Settings.`;
        const last = prev[prev.length - 1] as unknown as ChatMessageLike | undefined;
        if (last?.role === "assistant" && !getMessageText(last).trim()) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: fallback } : m));
        }
        return [...prev, { id: `fallback-${Date.now()}`, role: "assistant", content: fallback }];
      });
    },
  });

  // Elapsed-time counter
  useEffect(() => {
    if (!isLoading) { setElapsedSeconds(0); return; }
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Report status
  useEffect(() => {
    setChatStatus({ modelName: chatModelName, isLoading, elapsedSeconds });
  }, [chatModelName, isLoading, elapsedSeconds]);

  // Fallback for empty assistant response
  useEffect(() => {
    if (isLoading) return;
    const list = messages as unknown as ChatMessageLike[];
    const last = list[list.length - 1];
    if (last?.role === "assistant" && !getMessageText(last).trim()) {
      setMessages((prev) => {
        const fallback = "The model finished without returning visible text. Try again or change the active model in Settings.";
        const currentLast = prev[prev.length - 1] as unknown as ChatMessageLike | undefined;
        if (currentLast?.role === "assistant") return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: fallback } : m));
        return [...prev, { id: `fallback-${Date.now()}`, role: "assistant", content: fallback }];
      });
    }
  }, [isLoading, messages, setMessages]);

  // Auto-title from first user message
  useEffect(() => {
    if (hasTitled) return;
    const firstUser = (messages as unknown as ChatMessageLike[]).find((m) => m.role === "user");
    if (firstUser) {
      const text = getMessageText(firstUser).trim();
      if (text) {
        const title = shortenTitle(text);
        setChatTitle(title);
        setHasTitled(true);
      }
    }
  }, [messages, hasTitled]);

  // Persist messages to DB (debounced)
  useEffect(() => {
    if (!messagesLoaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const msgs = (messages as unknown as ChatMessageLike[]).map(toStorableMessage);
      fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: chatId, title: chatTitle, messages: msgs }),
      }).catch(() => {});
    }, 500);
  }, [chatId, chatTitle, messages, messagesLoaded]);

  // Image preview URLs
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => { for (const u of urls) URL.revokeObjectURL(u); };
  }, [files]);

  // Scroll tracking
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => { isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (isAtBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-focus textarea
  useEffect(() => { if (!isLoading) textareaRef.current?.focus(); }, [isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, [input]);

  const mergeFiles = (current: File[], incoming: File[]) => {
    const out = [...current];
    const seen = new Set(current.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
    for (const f of incoming) {
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (!seen.has(key)) { out.push(f); seen.add(key); }
    }
    return out;
  };

  const filesToFileList = (items: File[]): FileList => {
    const dt = new DataTransfer();
    for (const f of items) dt.items.add(f);
    return dt.files;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && files.length === 0) return;
    if (isLoading) { stop(); await new Promise((r) => setTimeout(r, 80)); }
    setLiveLogs([`Prompt submitted (${new Date().toLocaleTimeString()}) — images: ${files.length}`]);
    const attachments = chatModelHasVision && files.length > 0 ? filesToFileList(files) : undefined;
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    useChatSubmit(e, { experimental_attachments: attachments, body: { activeContextId } });
  };

  const resendMessage = async (m: ChatMessageLike) => {
    const text = getMessageText(m).trim();
    const attachments = getAttachmentsForResend(m);
    if (!text && attachments.length === 0) return;
    if (isLoading) { stop(); await new Promise((r) => setTimeout(r, 80)); }
    setLiveLogs((p) => [`Resent message (${new Date().toLocaleTimeString()}) — images: ${attachments.length}`, ...p].slice(0, 20));
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await append({ role: "user", content: text }, { experimental_attachments: attachments.length ? attachments : undefined, body: { activeContextId } });
  };

  const isLastAssistantStreaming = isLoading && (messages as unknown as ChatMessageLike[]).at(-1)?.role === "assistant";

  return (
    <main className="flex flex-col min-h-[calc(100vh-4rem)]">
      <header className="sticky top-0 z-20 border-b border-zinc-800 px-4 py-3 flex items-center gap-3 bg-zinc-950">
        <Link href="/admin/assistant" className="text-zinc-400 hover:text-white text-sm flex-shrink-0">Assistant</Link>
        <Link href="/admin/chats" className="text-zinc-400 hover:text-white text-sm flex-shrink-0">Chats</Link>

        {/* Chat title */}
        <span className="text-sm font-medium text-zinc-200 truncate max-w-[240px]" title={chatTitle}>
          {chatTitle}
        </span>

        {/* New chat button */}
        <button
          onClick={() => router.push(`/admin/assistant/${makeChatId()}`)}
          className="px-2.5 py-1 rounded text-xs border border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 flex-shrink-0"
        >
          + New chat
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-zinc-500 hidden sm:block">{chatStatus.modelName || "…"}</span>
          <div className="w-px h-3 bg-zinc-700 hidden sm:block" />

          <span className="text-xs text-zinc-500">Context</span>
          <select
            value={activeContextId}
            onChange={(e) => void updateActiveContext(e.target.value)}
            disabled={loadingContexts || savingContextId}
            className="px-2 py-1 rounded text-xs border border-zinc-700 bg-zinc-900 text-zinc-200 min-w-36"
          >
            <option value="">{loadingContexts ? "Loading…" : "No context"}</option>
            {contexts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {savingContextId && <span className="text-[11px] text-zinc-500">Saving…</span>}

          <div className="w-px h-3 bg-zinc-700" />

          {chatStatus.isLoading ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
              Working…
              <span className="tabular-nums text-zinc-500">
                {Math.floor(chatStatus.elapsedSeconds / 60)}:{String(chatStatus.elapsedSeconds % 60).padStart(2, "0")}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Ready
            </span>
          )}
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="text-center py-16 text-zinc-500">
            <p className="mb-2 text-base">Ask anything or give browser instructions.</p>
            <p className="text-sm mb-4 text-zinc-600">
              Examples: &quot;Go to google.com&quot; · &quot;Scrape xhamster homepage&quot; · &quot;What do you see?&quot;
            </p>
          </div>
        )}

        {(messages as unknown as ChatMessageLike[]).map((m, idx) => {
          const text = getMessageText(m);
          const textForDisplay = stripImageMetaLines(text);
          const isLastMsg = idx === messages.length - 1;
          const imagesToShow = m.role === "user" ? getAttachedImagesForMessage(m) : getAssistantImagePaths(text);
          const showCursor = isLastAssistantStreaming && isLastMsg && m.role === "assistant";

          return (
            <div
              key={m.id}
              className={`group rounded-xl px-4 py-3 ${m.role === "user" ? "bg-zinc-800 ml-10 self-end" : "bg-zinc-900 mr-10"}`}
            >
              <div className="text-[11px] text-zinc-500 mb-1.5 font-semibold uppercase tracking-wide">
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              {m.role === "user" && (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => void resendMessage(m)}
                    className="text-[11px] px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  >
                    Resend
                  </button>
                </div>
              )}
              <p className="text-zinc-200 whitespace-pre-wrap leading-relaxed text-sm">
                {textForDisplay}
                {showCursor && <span className="inline-block w-0.5 h-4 bg-amber-400 ml-0.5 align-text-bottom animate-pulse" />}
              </p>
              {imagesToShow.length > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {imagesToShow.map((img, i) => (
                    <a key={`${img}-${i}`} href={toImageSrc(img!)} target="_blank" rel="noreferrer" className="block rounded border border-zinc-700 overflow-hidden bg-zinc-800">
                      <img src={toImageSrc(img!)} alt={m.role === "user" ? "Attached" : "Result"} className="w-full h-32 object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Live logs */}
      {liveLogs.length > 0 && (
        <div className="mx-4 mb-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs">
          <div className="font-medium mb-1 text-zinc-300">Activity</div>
          <div className="space-y-0.5 max-h-28 overflow-y-auto font-mono">
            {liveLogs.map((line, i) => <div key={`${line}-${i}`} className="truncate">- {line}</div>)}
            {isLoading && <div className="text-amber-400 animate-pulse">- Processing…</div>}
          </div>
        </div>
      )}

      {error && (
        <div className="mx-4 mb-1 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          {error.message}
        </div>
      )}
      {!chatModelHasVision && files.length > 0 && (
        <div className="mx-4 mb-1 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          The selected model does not support image attachments. Attached images will be ignored.
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-zinc-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={`${f.name}-${f.lastModified}-${i}`} className="relative w-16 h-16 rounded overflow-hidden border border-zinc-700 bg-zinc-900" title={f.name}>
                  <img src={previewUrls[i]} alt={f.name} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/80 text-white text-[10px] leading-4 text-center hover:bg-red-700">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <input type="file" ref={fileInputRef} accept="image/*" multiple onChange={(e) => { const selected = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/")); setFiles((prev) => mergeFiles(prev, selected)); }} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!chatModelHasVision} title="Attach image" className="p-2.5 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
              📷
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                if (!chatModelHasVision) return;
                const pasted = Array.from(e.clipboardData.items).filter((item) => item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((f): f is File => !!f);
                if (pasted.length > 0) { e.preventDefault(); setFiles((prev) => mergeFiles(prev, pasted)); }
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
              placeholder={isLoading ? "Type to interrupt and send a new message…" : "Message the assistant…"}
              rows={1}
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-600/50 resize-none overflow-hidden text-sm transition-colors"
            />
            {isLoading && (
              <button type="button" onClick={stop} className="px-4 py-3 rounded-xl font-medium text-sm flex-shrink-0 bg-zinc-700 hover:bg-red-700 text-zinc-200 hover:text-white transition-colors">Stop</button>
            )}
            <button type="submit" disabled={!input.trim() && files.length === 0} className="px-4 py-3 rounded-xl font-medium text-sm flex-shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-500 text-white">
              Send
            </button>
          </div>
          <p className="text-[11px] text-zinc-600">
            Enter to send · Shift+Enter for new line · Paste images with Ctrl/Cmd+V
            {isLoading && " · Type and send to interrupt the current response"}
          </p>
        </div>
      </form>
    </main>
  );
}
