"use client";

import { useCallback, useEffect, useState } from "react";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none";

type CredsSummary = {
  clientId: string;
  username: string;
  userAgent: string;
  hasClientSecret: boolean;
  hasRefreshToken: boolean;
  hasPassword: boolean;
  configured: boolean;
};

type Subreddit = {
  name: string;
  title: string;
  subscribers: number;
  nsfw: boolean;
  userIsModerator: boolean;
};

type VideoHit = {
  id: string;
  title: string;
  slug: string;
  durationSec: number | null;
  status: string;
};

export default function WebsiteRedditForm({
  siteId,
  siteDomain,
  initial,
}: {
  siteId: string;
  siteDomain: string;
  initial: CredsSummary;
}) {
  const [creds, setCreds] = useState(initial);
  const [clientId, setClientId] = useState(initial.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [username, setUsername] = useState(initial.username);
  const [password, setPassword] = useState("");
  const [userAgent, setUserAgent] = useState(initial.userAgent);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [identity, setIdentity] = useState<string | null>(null);
  const [moderated, setModerated] = useState<Subreddit[]>([]);
  const [subscribed, setSubscribed] = useState<Subreddit[]>([]);

  // Create community
  const [newName, setNewName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<"public" | "restricted" | "private">("public");
  const [newNsfw, setNewNsfw] = useState(true);
  const [creating, setCreating] = useState(false);

  // Post
  const [subreddit, setSubreddit] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"self" | "link" | "video">("video");
  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [nsfw, setNsfw] = useState(true);
  const [videoQuery, setVideoQuery] = useState("");
  const [videoHits, setVideoHits] = useState<VideoHit[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoHit | null>(null);
  const [linkToPage, setLinkToPage] = useState(false);
  const [posting, setPosting] = useState(false);
  const [lastPostUrl, setLastPostUrl] = useState<string | null>(null);

  const flash = (msg: string, isError = false) => {
    if (isError) {
      setError(msg);
      setStatus("");
    } else {
      setStatus(msg);
      setError(null);
    }
  };

  async function saveCredentials(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setStatus("");
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/reddit`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim() || null,
          clientSecret: clientSecret.trim() || undefined,
          refreshToken: refreshToken.trim() || undefined,
          username: username.trim() || null,
          password: password.trim() || undefined,
          userAgent: userAgent.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || "Failed to save", true);
        return;
      }
      setCreds(data.credentials);
      setClientSecret("");
      setRefreshToken("");
      setPassword("");
      flash("Reddit credentials saved.");
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(field: "clientSecret" | "refreshToken" | "password") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/reddit`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: "__CLEAR__" }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || "Failed to clear", true);
        return;
      }
      setCreds(data.credentials);
      flash(`Cleared ${field}.`);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError(null);
    setStatus("");
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/reddit/test`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || "Connection failed", true);
        setIdentity(null);
        return;
      }
      setIdentity(data.identity?.name || null);
      setModerated(data.moderated || []);
      setSubscribed(data.subscribed || []);
      flash(`Connected as u/${data.identity?.name}.`);
      if (!subreddit && data.moderated?.[0]?.name) {
        setSubreddit(data.moderated[0].name);
      }
    } finally {
      setTesting(false);
    }
  }

  async function createCommunity(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setStatus("");
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/reddit/communities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          title: newTitle.trim() || newName.trim(),
          publicDescription: newDesc.trim() || undefined,
          type: newType,
          over18: newNsfw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || "Failed to create community", true);
        return;
      }
      flash(`Created r/${data.community.name}`);
      setSubreddit(data.community.name);
      setModerated((prev) => [
        {
          name: data.community.name,
          title: newTitle || data.community.name,
          subscribers: 1,
          nsfw: newNsfw,
          userIsModerator: true,
        },
        ...prev,
      ]);
    } finally {
      setCreating(false);
    }
  }

  const searchVideos = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setVideoHits([]);
      return;
    }
    const res = await fetch(
      `/api/admin/videos/search?q=${encodeURIComponent(q)}&limit=15&siteId=${encodeURIComponent(siteId)}`
    );
    const data = await res.json();
    if (res.ok) setVideoHits(data.videos || []);
  }, [siteId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void searchVideos(videoQuery);
    }, 250);
    return () => clearTimeout(t);
  }, [videoQuery, searchVideos]);

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    setError(null);
    setStatus("");
    setLastPostUrl(null);
    try {
      const payload: Record<string, unknown> = {
        subreddit: subreddit.trim(),
        title: title.trim(),
        kind,
        nsfw,
        text: kind === "self" ? text : undefined,
        url: kind === "link" && !selectedVideo ? linkUrl.trim() : undefined,
        videoId: kind === "video" || (kind === "link" && selectedVideo) ? selectedVideo?.id : undefined,
        linkToVideoPage: kind === "link" && selectedVideo ? true : linkToPage,
      };
      if (kind === "video" && !selectedVideo) {
        flash("Select a library video to upload", true);
        return;
      }
      const res = await fetch(`/api/admin/sites/${siteId}/reddit/post`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        flash(data.error || "Post failed", true);
        return;
      }
      setLastPostUrl(data.post?.url || null);
      flash(
        data.post?.url
          ? `Posted (${data.kind}).`
          : `Submitted (${data.kind}) — Reddit may still be processing the media.`
      );
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-8">
      {(error || status) && (
        <p
          className={`rounded px-3 py-2 text-sm ${
            error ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
          }`}
        >
          {error || status}
          {lastPostUrl ? (
            <>
              {" "}
              <a href={lastPostUrl} target="_blank" rel="noreferrer" className="underline">
                Open post
              </a>
            </>
          ) : null}
        </p>
      )}

      <form
        onSubmit={saveCredentials}
        className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Devvit / Reddit app credentials</h2>
          <p className="mt-1 text-xs text-zinc-500">
            From{" "}
            <a
              href="https://developers.reddit.com/"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 underline"
            >
              developers.reddit.com
            </a>{" "}
            (or reddit.com/prefs/apps). Prefer a permanent refresh token from your OAuth / npm helper.
            Script apps can use username + password instead of a refresh token. Credentials are stored
            per website and never sent to the public site frontend.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Client ID</span>
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">
            Client secret{creds.hasClientSecret ? " (saved — leave blank to keep)" : ""}
          </span>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className={inputClass}
            autoComplete="off"
            placeholder={creds.hasClientSecret ? "••••••••" : ""}
          />
          {creds.hasClientSecret ? (
            <button
              type="button"
              onClick={() => void clearSecret("clientSecret")}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear saved secret
            </button>
          ) : null}
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">
            Refresh token{creds.hasRefreshToken ? " (saved — leave blank to keep)" : ""}
          </span>
          <input
            type="password"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            className={inputClass}
            autoComplete="off"
            placeholder={creds.hasRefreshToken ? "••••••••" : "Token from oauth / npm helper"}
          />
          {creds.hasRefreshToken ? (
            <button
              type="button"
              onClick={() => void clearSecret("refreshToken")}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear saved token
            </button>
          ) : null}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-400">Reddit username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-400">
              Password (script apps){creds.hasPassword ? " — leave blank to keep" : ""}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="off"
              placeholder={creds.hasPassword ? "••••••••" : "Optional if using refresh token"}
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Custom User-Agent (optional)</span>
          <input
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
            className={inputClass}
            placeholder={`web:scrapor-reddit:1.0.0 (by /u/${username || "you"})`}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save credentials"}
          </button>
          <button
            type="button"
            disabled={testing || !creds.configured}
            onClick={() => void testConnection()}
            className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>
        {identity ? (
          <p className="text-xs text-zinc-500">
            Authenticated as <span className="text-zinc-300">u/{identity}</span>
            {moderated.length ? ` · ${moderated.length} moderated communities` : null}
          </p>
        ) : null}
      </form>

      <form
        onSubmit={createCommunity}
        className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Create community</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Reddit may reject creates for new / low-karma accounts. Requires working credentials.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-400">Name (r/…)</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value.replace(/\s/g, ""))}
              className={inputClass}
              maxLength={21}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-400">Title</span>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={inputClass} />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Short description</span>
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className={inputClass}
            rows={2}
          />
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            Type
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as typeof newType)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
            >
              <option value="public">Public</option>
              <option value="restricted">Restricted</option>
              <option value="private">Private</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={newNsfw} onChange={(e) => setNewNsfw(e.target.checked)} />
            NSFW (18+)
          </label>
        </div>
        <button
          type="submit"
          disabled={creating || !creds.configured}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create community"}
        </button>
      </form>

      <form
        onSubmit={submitPost}
        className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Post to a community</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Video posts upload the library MP4 + thumbnail to Reddit&apos;s CDN (native video). Large
            files can take a minute. Site: {siteDomain}
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Subreddit</span>
          <input
            value={subreddit}
            onChange={(e) => setSubreddit(e.target.value.replace(/^r\//i, ""))}
            className={inputClass}
            list="reddit-subs"
            required
            placeholder="mycommunity"
          />
          <datalist id="reddit-subs">
            {[...moderated, ...subscribed].map((s) => (
              <option key={s.name} value={s.name}>
                {s.title}
              </option>
            ))}
          </datalist>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm text-zinc-400">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            maxLength={300}
            required
          />
        </label>

        <fieldset className="flex flex-wrap gap-4 text-sm text-zinc-300">
          {(
            [
              ["video", "Native video"],
              ["link", "Link"],
              ["self", "Text"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} />
            NSFW
          </label>
        </fieldset>

        {kind === "self" ? (
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-400">Body (markdown)</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} className={inputClass} rows={5} />
          </label>
        ) : null}

        {kind === "link" && !selectedVideo ? (
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-400">URL</span>
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className={inputClass}
              type="url"
              placeholder={`https://${siteDomain}/videos/...`}
            />
          </label>
        ) : null}

        {(kind === "video" || kind === "link") && (
          <div className="space-y-2">
            <label className="block space-y-1.5">
              <span className="text-sm text-zinc-400">
                {kind === "video" ? "Library video (required)" : "Or pick a library video for the link"}
              </span>
              <input
                value={videoQuery}
                onChange={(e) => setVideoQuery(e.target.value)}
                className={inputClass}
                placeholder="Search videos by title…"
              />
            </label>
            {selectedVideo ? (
              <div className="flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                <span className="text-zinc-200">{selectedVideo.title}</span>
                <button
                  type="button"
                  className="text-xs text-zinc-500 hover:text-white"
                  onClick={() => setSelectedVideo(null)}
                >
                  Clear
                </button>
              </div>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {videoHits.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVideo(v);
                        if (!title.trim()) setTitle(v.title.slice(0, 300));
                      }}
                      className="w-full rounded px-2 py-1.5 text-left text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    >
                      {v.title}
                      {v.durationSec != null ? (
                        <span className="ml-2 text-xs text-zinc-600">{v.durationSec}s</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {kind === "video" ? (
              <label className="flex items-center gap-2 text-xs text-zinc-500">
                <input
                  type="checkbox"
                  checked={linkToPage}
                  onChange={(e) => setLinkToPage(e.target.checked)}
                />
                Post as link to site page instead of uploading native video
              </label>
            ) : null}
          </div>
        )}

        <button
          type="submit"
          disabled={posting || !creds.configured}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {posting ? "Posting… (video upload can take a while)" : "Publish post"}
        </button>
      </form>
    </div>
  );
}
