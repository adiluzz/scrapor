import { readFile } from "fs/promises";
import { join, normalize } from "path";
import { guardAdmin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";

const ALLOWED_PREFIXES = [
  "library/assistant-screenshots/",
  "library/mcp-screenshots/",
  "library/assistant-recordings/",
  "library/mcp-recordings/",
];

function isAllowedPath(p: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix));
}

function toContentType(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

export async function GET(req: Request) {
  const g = await guardAdmin();
  if (g instanceof NextResponse) return g;
  const url = new URL(req.url);
  const rawPath = (url.searchParams.get("path") || "").trim().replace(/^\/+/, "");
  const normalized = normalize(rawPath).replace(/\\/g, "/");

  if (!normalized || normalized.includes("..") || !isAllowedPath(normalized)) {
    return new Response("Invalid path", { status: 400 });
  }

  if (!/\.(png|jpg|jpeg|webp|gif)$/i.test(normalized)) {
    return new Response("Only image files are supported", { status: 400 });
  }

  const absPath = join(process.cwd(), normalized);
  try {
    const file = await readFile(absPath);
    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": toContentType(normalized.toLowerCase()),
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

