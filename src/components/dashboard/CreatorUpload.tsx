"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreatorUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setDone(false);
    setLoading(true);
    setProgress(0);
    try {
      // Upload the raw file THROUGH our server; it stores it and queues the
      // worker to transcode + generate thumbnail/preview/storyboard.
      const qs = new URLSearchParams({
        title,
        description,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .join(","),
      });

      const result = await new Promise<{ ok?: boolean; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/creator/videos?${qs.toString()}`);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (ev) =>
          ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
        xhr.onload = () => {
          let body: { ok?: boolean; error?: string } = {};
          try {
            body = JSON.parse(xhr.responseText || "{}");
          } catch {
            /* non-JSON */
          }
          if (xhr.status >= 200 && xhr.status < 300) resolve(body);
          else reject(new Error(body.error || `Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      if (!result.ok) throw new Error(result.error || "Upload failed");

      // The video is now processing; it becomes visible once the worker finishes.
      setDone(true);
      setFile(null);
      setTitle("");
      setDescription("");
      setTags("");
      setProgress(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={upload} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-lg font-semibold text-white">Upload a video</h2>
      {error && <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
      {done && (
        <p className="rounded bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Uploaded! Your video is processing (thumbnail, preview &amp; scrubber
          are being generated) and will appear on your page once it&apos;s ready.
        </p>
      )}
      <input
        type="file"
        accept="video/*"
        required
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-pink-600 file:px-4 file:py-2 file:text-white"
      />
      <input
        required
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none"
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        rows={2}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none"
      />
      <input
        placeholder="Tags (comma-separated)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none"
      />
      {progress !== null && loading && (
        <div className="h-2 w-full overflow-hidden rounded bg-zinc-800">
          <div className="h-full bg-pink-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <button
        disabled={loading}
        type="submit"
        className="rounded-lg bg-pink-600 px-5 py-2.5 font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {loading ? `Uploading… ${progress ?? 0}%` : "Upload"}
      </button>
    </form>
  );
}
