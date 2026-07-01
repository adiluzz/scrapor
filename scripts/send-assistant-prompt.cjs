#!/usr/bin/env node
/**
 * Opens the assistant page and submits a prompt.
 * Usage: node scripts/send-assistant-prompt.cjs "Your prompt here"
 * Or: node scripts/send-assistant-prompt.cjs  (reads from stdin)
 *
 * Prerequisites: npm run dev (Next.js) must be running.
 */

const { chromium } = require("playwright");

const ASSISTANT_URL = process.env.ASSISTANT_URL || `http://localhost:${process.env.PORT || 3000}/assistant`;

async function main() {
  const prompt =
    process.argv[2] ||
    (await new Promise((resolve) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data.trim()));
    }));

  if (!prompt) {
    console.error("Usage: node send-assistant-prompt.cjs \"Your prompt\"");
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  console.log(`Opening ${ASSISTANT_URL}...`);
  await page.goto(ASSISTANT_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  const input = page.getByPlaceholder(/Type a command|describe what you see/i);
  const sendBtn = page.getByRole("button", { name: /send/i });

  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.fill(prompt);
  await sendBtn.click();

  console.log("Prompt sent. Assistant is processing. Leave the browser open to observe.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
