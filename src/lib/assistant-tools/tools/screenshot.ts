import {
  browserEvaluateJS,
  browserGetContent,
  browserGetUrl,
  browserSaveScreenshot,
  browserScreenshot,
} from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { jsonSchema, tool } from "ai";

const assistantTool = {
  key: "screenshot",
  description: "Capture a screenshot with saved image path, clickable element map, and page text.",
  createTool: ({ runtimeModelHasVision }) =>
    tool({
      description: "Take screenshot and return saved image path, page text, and clickable element coordinates.",
      parameters: jsonSchema({ type: "object", properties: {} }),
      execute: async () => {
        const url = await browserGetUrl();
        const elementMap = await browserEvaluateJS(`
          const sel = 'button, a, input, select, video, [role="button"], li, [class*="skip"], [class*="play"], [class*="close"], [class*="accept"], [class*="consent"], [class*="age"], [class*="quality"], [class*="settings"], [class*="lang"], [class*="enter"]';
          const vw = window.innerWidth, vh = window.innerHeight;
          const els = Array.from(document.querySelectorAll(sel));
          const seen = new Set();
          const results = [];
          for (const el of els) {
            if (el.tagName === 'HTML' || el.tagName === 'BODY') continue;
            const r = el.getBoundingClientRect();
            if (r.width < 4 || r.height < 4) continue;
            if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
            const text = (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g,' ').slice(0, 50);
            if (!text) continue;
            const key = text + '|' + Math.round(r.left/20) + '|' + Math.round(r.top/20);
            if (seen.has(key)) continue;
            seen.add(key);
            results.push('[' + el.tagName + '] "' + text + '" @ (' + Math.round(r.left + r.width/2) + ', ' + Math.round(r.top + r.height/2) + ')');
            if (results.length >= 80) break;
          }
          return results.join('\\n');
        `);
        const shotName = `auto-${Date.now()}`;
        const savedLocation = await browserSaveScreenshot(shotName);
        const content = await browserGetContent();
        let elemMapRaw = elementMap;
        try { elemMapRaw = JSON.parse(elementMap); } catch { /* already plain text */ }
        const textPart = `${savedLocation}\nURL: ${url}\n\nClickable elements (use clickAt(x,y)):\n${elemMapRaw}\n\nPage text:\n${content.slice(0, 1200)}`;
        if (runtimeModelHasVision) {
          const base64 = await browserScreenshot();
          return [
            { type: "text" as const, text: textPart },
            { type: "image" as const, data: base64, mimeType: "image/png" as const },
          ];
        }
        return textPart;
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
