const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "reset_token",
  "password",
  "new_password",
  "g_recaptcha_response",
  "recaptcha",
  "code",
  "access_token",
  "refresh_token",
  "session",
  "apikey",
  "api_key",
]);

export function redactSearchParams(search: string): string {
  if (!search) return "";
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return "";
  try {
    const params = new URLSearchParams(raw);
    let mutated = false;
    for (const key of Array.from(params.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        params.set(key, "<redacted>");
        mutated = true;
      }
    }
    const out = mutated ? params.toString() : raw;
    return `?${out}`;
  } catch {
    return "?<unparseable>";
  }
}
