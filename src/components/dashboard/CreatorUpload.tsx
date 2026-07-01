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
  const [loading, setLoading] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setLoading(true);
    setProgress(0);
    try {
      // 1. Presign
      const presignRes = await fetch("/api/creator/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contentType: file.type || "video/mp4" }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) { setError(presign.error || "Upload not available"); return; }

      // 2. Direct PUT to S3 with progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", presign.url);
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
        xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
        xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error("S3 upload failed")));
        xhr.onerror = () => reject(new Error("S3 upload failed"));
        xhr.send(file);
      });

      // 3. Finalize
      const finalizeRes = await fetch("/api/creator/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadId: presign.uploadId,
          title,
          description,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      const data = await finalizeRes.json();
      if (!finalizeRes.ok) { setError(data.error || "Failed to save"); return; }
      router.push(`/videos/${data.slug}`);
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
      <input type="file" accept="video/*" required
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-pink-600 file:px-4 file:py-2 file:text-white" />
      <input required placeholder="Title" value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none" />
      <textarea placeholder="Description (optional)" value={description} rows={2}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none" />
      <input placeholder="Tags (comma-separated)" value={tags}
        onChange={(e) => setTags(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-pink-500 focus:outline-none" />
      {progress !== null && loading && (
        <div className="h-2 w-full overflow-hidden rounded bg-zinc-800">
          <div className="h-full bg-pink-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <button disabled={loading} type="submit"
        className="rounded-lg bg-pink-600 px-5 py-2.5 font-medium text-white hover:bg-pink-500 disabled:opacity-50">
        {loading ? `Uploading… ${progress ?? 0}%` : "Upload"}
      </button>
    </form>
  );
}
