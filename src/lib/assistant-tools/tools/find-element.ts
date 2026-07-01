import { browserEvaluateJS } from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "findElement",
  description: "Find visible element coordinates by text.",
  createTool: () =>
    tool({
      description: "Find a visible element by its text content and return its center (x,y) for clickAt(). Prefers buttons and links within the visible viewport.",
      parameters: z.object({ text: z.string() }),
      execute: async ({ text }) => {
        const result = await browserEvaluateJS(`
          const needle = ${JSON.stringify(text)}.toLowerCase().trim();
          const vw = window.innerWidth, vh = window.innerHeight;
          const TAG_PRIORITY = {A:1, BUTTON:1, INPUT:2, SPAN:3, LI:4, DIV:5};
          const candidates = [];
          const els = Array.from(document.querySelectorAll('a, button, input, span, li, [role="button"]'));
          for (const el of els) {
            const raw = (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').trim();
            const t = raw.toLowerCase();
            if (!t.includes(needle)) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
            const priority = TAG_PRIORITY[el.tagName] || 6;
            const exactness = t === needle ? 0 : raw.length;
            candidates.push({ tag: el.tagName, text: raw.slice(0,80), x: Math.round(r.left+r.width/2), y: Math.round(r.top+r.height/2), priority, exactness });
          }
          if (!candidates.length) return { found: false };
          candidates.sort((a,b) => a.priority - b.priority || a.exactness - b.exactness);
          const best = candidates[0];
          return { found: true, tag: best.tag, text: best.text, x: best.x, y: best.y };
        `);
        try {
          const parsed = JSON.parse(result);
          if (parsed.found) return `Found [${parsed.tag}] "${parsed.text}" -> use clickAt(${parsed.x}, ${parsed.y})`;
          return `Element with text "${text}" not found in viewport. Try screenshot(), scroll, or evaluateJS.`;
        } catch {
          return result;
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
