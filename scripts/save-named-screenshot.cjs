#!/usr/bin/env node
/**
 * Saves a screenshot with a specific filename (bypasses Ollama).
 * Usage: node scripts/save-named-screenshot.cjs <filename>
 * Example: node scripts/save-named-screenshot.cjs e2e-test-photo
 *
 * Requires: npm run dev (Next.js server running)
 */
const filename = process.argv[2] || "screenshot";
const base = process.env.ASSISTANT_URL?.replace(/\/assistant.*$/, "") || "http://localhost:3000";

async function main() {
  const url = `${base}/api/test-screenshot?filename=${encodeURIComponent(filename)}`;
  console.log("Calling", url);
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || res.statusText);
  }
  console.log("OK:", data.message);
  const path = require("path");
  const fs = require("fs");
  const expectedPath = path.join(process.cwd(), "library", "assistant-screenshots", `${filename.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`);
  const exists = fs.existsSync(expectedPath);
  console.log("File exists:", exists, "at", expectedPath);
  if (exists) {
    const stat = fs.statSync(expectedPath);
    console.log("Size:", stat.size, "bytes");
  }
  process.exit(exists ? 0 : 1);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
