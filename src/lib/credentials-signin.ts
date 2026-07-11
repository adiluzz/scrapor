/**
 * Credentials sign-in without next-auth/react's `signIn()`.
 *
 * That helper calls `/api/auth/providers` first and, on any failure (e.g.
 * transient nginx 502), hard-navigates to `/api/auth/error` even when
 * `redirect: false` — which is the dark "Error / hostname" Auth.js page.
 */
export async function credentialsSignIn(input: {
  email: string;
  password: string;
  code: string;
  mode: "login" | "signup";
  callbackUrl: string;
}): Promise<{ ok: boolean; error?: string; url?: string }> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const csrfRes = await fetch("/api/auth/csrf", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!csrfRes.ok) {
        await sleep(200 * (attempt + 1));
        continue;
      }
      const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
      if (!csrfToken) {
        await sleep(200 * (attempt + 1));
        continue;
      }

      const res = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({
          email: input.email,
          password: input.password,
          code: input.code,
          mode: input.mode,
          csrfToken,
          callbackUrl: input.callbackUrl,
        }),
      });
      if (res.status === 502 || res.status === 503) {
        await sleep(200 * (attempt + 1));
        continue;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) return { ok: false, error: "Login failed" };
      const err = new URL(data.url, window.location.origin).searchParams.get("error");
      if (err) return { ok: false, error: err };
      return { ok: true, url: data.url };
    } catch {
      await sleep(200 * (attempt + 1));
    }
  }
  return { ok: false, error: "NetworkError" };
}
