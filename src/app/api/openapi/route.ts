import { readFile } from "fs/promises";
import { join } from "path";
import { NextResponse } from "next/server";
import { guardApiKeyOnly } from "@/lib/admin-guard";

const SPEC_PATH = join(process.cwd(), "openapi", "openapi.yaml");

export async function GET(request: Request) {
  const auth = await guardApiKeyOnly(request);
  if (auth instanceof NextResponse) return auth;

  const yaml = await readFile(SPEC_PATH, "utf8");
  const accept = request.headers.get("accept") || "";
  if (accept.includes("application/json")) {
    // Minimal YAML-to-JSON is not needed; clients can use yaml.
    return new NextResponse(yaml, {
      headers: { "Content-Type": "text/yaml; charset=utf-8" },
    });
  }
  return new NextResponse(yaml, {
    headers: { "Content-Type": "text/yaml; charset=utf-8" },
  });
}
