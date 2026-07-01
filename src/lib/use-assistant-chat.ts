"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Minimal, dependency-free chat streaming hook.
 *
 * It replaces the AI SDK's `useChat` on the client so the assistant UI has no
 * runtime dependency on `@ai-sdk/react` (which historically pulled in the
 * vulnerable `@ai-sdk/ui-utils` / `jsondiffpatch` chain). The server route
 * (`/api/assistant`) returns a plain text stream via `toTextStreamResponse()`;
 * this hook POSTs the message history and appends streamed deltas to a live
 * assistant message. The public surface intentionally mirrors the subset of the
 * old `useChat` API the assistant page consumes.
 */

export type AssistantAttachment = { url: string; contentType?: string; name?: string };

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  experimental_attachments?: AssistantAttachment[];
};

type SubmitOptions = {
  experimental_attachments?: FileList | AssistantAttachment[];
  body?: Record<string, unknown>;
};

type UseAssistantChatOptions = {
  id?: string;
  api?: string;
  initialMessages?: AssistantMessage[];
  body?: Record<string, unknown>;
  onResponse?: (res: Response) => void;
  onFinish?: (message: AssistantMessage) => void;
  onError?: (error: Error) => void;
};

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

async function normalizeAttachments(
  attachments: FileList | AssistantAttachment[] | undefined
): Promise<AssistantAttachment[] | undefined> {
  if (!attachments) return undefined;
  if (attachments instanceof FileList) {
    const out: AssistantAttachment[] = [];
    for (const file of Array.from(attachments)) {
      out.push({ url: await readFileAsDataUrl(file), contentType: file.type, name: file.name });
    }
    return out.length ? out : undefined;
  }
  return attachments.length ? attachments : undefined;
}

export function useAssistantChat(options: UseAssistantChatOptions) {
  const {
    id,
    api = "/api/assistant",
    initialMessages,
    body,
    onResponse,
    onFinish,
    onError,
  } = options;

  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);
  const interactedRef = useRef(false);
  const messagesRef = useRef<AssistantMessage[]>(messages);
  messagesRef.current = messages;
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const initialRef = useRef(initialMessages);
  initialRef.current = initialMessages;

  // Reset "interacted" when switching chats so freshly loaded history syncs.
  useEffect(() => {
    interactedRef.current = false;
  }, [id]);

  // Sync loaded history until the user starts interacting. `initialKey` is a
  // content hash so a new array reference each render doesn't cause a loop.
  const initialKey = useMemo(() => JSON.stringify(initialMessages ?? []), [initialMessages]);
  useEffect(() => {
    if (!interactedRef.current) setMessages(initialRef.current ?? []);
  }, [initialKey, id]);

  const runStream = useCallback(
    async (history: AssistantMessage[], extraBody?: Record<string, unknown>) => {
      setIsLoading(true);
      setError(undefined);
      const controller = new AbortController();
      abortRef.current = controller;

      const assistantId = genId();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      try {
        const res = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
              experimental_attachments: m.experimental_attachments,
            })),
            ...(bodyRef.current || {}),
            ...(extraBody || {}),
          }),
        });
        onResponse?.(res);

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `Assistant request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
          );
        }
        onFinish?.({ id: assistantId, role: "assistant", content: acc });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (err.name !== "AbortError") {
          setError(err);
          onError?.(err);
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [api, onResponse, onFinish, onError]
  );

  const append = useCallback(
    async (
      message: { role: "user" | "assistant" | "system"; content: string },
      opts?: SubmitOptions
    ) => {
      interactedRef.current = true;
      const attachments = await normalizeAttachments(opts?.experimental_attachments);
      const userMsg: AssistantMessage = {
        id: genId(),
        role: message.role,
        content: message.content,
        experimental_attachments: attachments,
      };
      const next = [...messagesRef.current, userMsg];
      setMessages(next);
      await runStream(next, opts?.body);
    },
    [runStream]
  );

  const handleSubmit = useCallback(
    async (e?: { preventDefault?: () => void }, opts?: SubmitOptions) => {
      e?.preventDefault?.();
      const text = input;
      if (!text.trim() && !opts?.experimental_attachments) return;
      setInput("");
      await append({ role: "user", content: text }, opts);
    },
    [input, append]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, setMessages, input, setInput, handleSubmit, append, isLoading, stop, error };
}
