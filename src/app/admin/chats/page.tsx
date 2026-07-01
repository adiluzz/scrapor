"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AssistantNav from "@/components/admin/AssistantNav";

type ChatResult = {
  id: string;
  title: string;
  updatedAt: string;
  preview: string;
  matchType: "title" | "message" | "none";
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined });
}

function highlight(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-amber-400/30 text-amber-200 rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function ChatCard({ chat, query }: { chat: ChatResult; query: string }) {
  return (
    <Link
      href={`/admin/assistant/${chat.id}`}
      className="group block rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 hover:border-zinc-600 hover:bg-zinc-800/70 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-zinc-100 truncate group-hover:text-white">
              {highlight(chat.title, query)}
            </h2>
            {chat.matchType === "title" && query && (
              <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300 border border-indigo-500/30">
                title match
              </span>
            )}
            {chat.matchType === "message" && query && (
              <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/30">
                message match
              </span>
            )}
          </div>
          {chat.preview && (
            <p className="mt-1.5 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
              {highlight(chat.preview, query)}
            </p>
          )}
        </div>
        <time className="shrink-0 text-[11px] text-zinc-500 mt-0.5" dateTime={chat.updatedAt}>
          {formatDate(chat.updatedAt)}
        </time>
      </div>
    </Link>
  );
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 mt-6 mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <span className="text-[11px] text-zinc-600 tabular-nums">{count}</span>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

export default function ChatsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatResult[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchChats = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const url = q.trim() ? `/api/chats?query=${encodeURIComponent(q)}` : "/api/chats";
      const res = await fetch(url);
      const data = await res.json();
      setResults(data.threads ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { document.title = "Chats | Scrapor"; }, []);

  // Initial load
  useEffect(() => {
    fetchChats("");
  }, [fetchChats]);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchChats(value), 300);
  }

  const titleMatches = results.filter((r) => r.matchType === "title");
  const messageMatches = results.filter((r) => r.matchType === "message");
  const allChats = results.filter((r) => r.matchType === "none");
  const isSearching = query.trim().length > 0;

  return (
    <div>
      <AssistantNav active="/admin/chats" />
      <h1 className="text-2xl font-bold text-white">Chats</h1>

      <div className="mt-6 max-w-3xl">
        {/* Search bar */}
        <div className="relative mb-6">
          <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
            <svg
              className="h-4 w-4 text-zinc-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search chats by title or messages…"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 pl-11 pr-10 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
          />
          {query && (
            <button
              onClick={() => handleQueryChange("")}
              className="absolute inset-y-0 right-3 flex items-center text-zinc-500 hover:text-zinc-300"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-zinc-600 text-sm gap-3">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading…
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-600 gap-3">
            <svg className="h-10 w-10 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <p className="text-sm">{isSearching ? "No chats match your search." : "No chats yet."}</p>
            {!isSearching && (
              <Link
                href="/admin/assistant"
                className="mt-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                Start a chat →
              </Link>
            )}
          </div>
        ) : isSearching ? (
          <>
            {titleMatches.length > 0 && (
              <>
                <SectionLabel label="Title matches" count={titleMatches.length} />
                <div className="flex flex-col gap-2">
                  {titleMatches.map((chat) => (
                    <ChatCard key={chat.id} chat={chat} query={query} />
                  ))}
                </div>
              </>
            )}
            {messageMatches.length > 0 && (
              <>
                <SectionLabel label="Message matches" count={messageMatches.length} />
                <div className="flex flex-col gap-2">
                  {messageMatches.map((chat) => (
                    <ChatCard key={chat.id} chat={chat} query={query} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Recent
              </span>
              <span className="text-[11px] text-zinc-600 tabular-nums">{allChats.length}</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
            <div className="flex flex-col gap-2">
              {allChats.map((chat) => (
                <ChatCard key={chat.id} chat={chat} query="" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
