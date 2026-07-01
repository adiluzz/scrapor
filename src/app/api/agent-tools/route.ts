import { listAssistantTools } from "@/lib/assistant-tools/registry";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request) {
  try {
    return Response.json({ tools: listAssistantTools() });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Failed to load tools" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
