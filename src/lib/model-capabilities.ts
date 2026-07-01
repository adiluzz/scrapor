export function isLikelyVisionModel(
  modelName: string,
  families?: string[],
  family?: string
): boolean {
  const name = (modelName || "").toLowerCase();
  const fams = (families || []).map((f) => String(f).toLowerCase());
  const singleFamily = (family || "").toLowerCase();

  if (fams.includes("clip")) return true;
  if (singleFamily === "clip") return true;
  if (singleFamily.includes("vl")) return true;
  if (fams.some((f) => f.includes("vl"))) return true;

  return /(llava|moondream|vl|vision|minicpm|bakllava|qwen[0-9.\-]*-?vl|phi-3-vision|gemma.*vision)/.test(
    name
  );
}

/**
 * Returns true for model families that are widely known to support function/tool calling.
 * Used as a fast heuristic so the live probe is only needed for unknown models.
 *
 * Models that do NOT support tools (llama2, nomic-embed, pure vision-only like llava)
 * are left out intentionally so the probe can confirm them.
 */
export function isLikelyToolModel(modelName: string): boolean {
  const name = (modelName || "").toLowerCase();

  // Explicit non-tool models
  if (/^llama2[:\-_]/.test(name) || name === "llama2") return false;
  if (/nomic[- ]?embed|all-minilm|mxbai-embed/.test(name)) return false;
  // Pure llava with no tools
  if (/^llava[:\-_]/.test(name) || name === "llava") return false;

  return !!(
    // Qwen family (qwen2, qwen2.5, qwen3, qwen2.5-coder, qwen2.5vl, qwen3-vl, …)
    /qwen/.test(name) ||
    // Llama 3.x (3.0, 3.1, 3.2, 3.3, …) — not llama2
    /llama3/.test(name) ||
    // Mistral / Mixtral / Ministral
    /mistral|mixtral|ministral/.test(name) ||
    // Phi-3 and Phi-4 (not phi-1 / phi-2)
    /phi[- _]?[34]/.test(name) || /phi4/.test(name) ||
    // Gemma 2 and newer
    /gemma[2-9]/.test(name) ||
    // Command-R, Aya
    /command-?r|aya/.test(name) ||
    // DeepSeek with tool support (v2+, r1)
    /deepseek-?v[2-9]|deepseek-?r[12]/.test(name) ||
    // Hermes, Nous, OpenHermes fine-tunes (known to have Hermes tool format)
    /hermes|nous/.test(name) ||
    // xLAM, Hammer, ToolACE — explicit tool-calling fine-tunes
    /xlam|hammer|toolace/.test(name) ||
    // Firefunction, functionary
    /firefunction|functionary/.test(name)
  );
}

