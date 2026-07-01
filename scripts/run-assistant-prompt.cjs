#!/usr/bin/env node
/**
 * Sends a prompt to the assistant API and waits for completion.
 * Usage: node scripts/run-assistant-prompt.cjs "Your prompt"
 * Does NOT open a browser - calls the API directly.
 */
const prompt = process.argv[2] || "Navigate to example.com and save a screenshot as e2e-api-test using saveScreenshot.";
const base = process.env.ASSISTANT_URL || "http://localhost:3000";

async function main() {
  console.log("Sending prompt:", prompt);
  console.log("To:", base + "/api/assistant");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000); // 3 min

  try {
    const res = await fetch(base + "/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", parts: [{ type: "text", text: prompt }] }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || res.statusText);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      process.stdout.write(".");
    }
    console.log("\nDone. Response length:", text.length);
    return text;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("Request timed out after 3 minutes");
    console.error("Full error:", e);
    throw e;
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  });
