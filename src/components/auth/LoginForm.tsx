"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { credentialsSignIn } from "@/lib/credentials-signin";

type LogoSite = {
  name: string;
  logoKey: string | null;
  primaryColor: string;
};

function postLoginPath(callbackUrl: string): string {
  // Soft client navigations can race the new session cookie and bounce back
  // to /login. Full-page assign always sends the cookie. On the admin host,
  // "/" is rewritten to /admin — prefer an explicit /admin target.
  if (typeof window !== "undefined" && window.location.hostname.startsWith("admin.")) {
    if (!callbackUrl || callbackUrl === "/") return "/admin";
  }
  return callbackUrl || "/";
}

export default function LoginForm({ site }: { site?: LogoSite | null }) {
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") || "/";
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      setStep("code");
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const dest = postLoginPath(callbackUrl);
      const res = await credentialsSignIn({
        email,
        password,
        code,
        mode: "login",
        callbackUrl: dest,
      });
      if (!res.ok) {
        setError(
          res.error === "NetworkError"
            ? "Temporary connection issue — try again"
            : "Invalid or expired code"
        );
        return;
      }
      // Full reload so middleware/RSC see the new session cookie.
      window.location.assign(dest);
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <div className="mb-6 flex justify-center">
          <Logo site={site} href="/" />
        </div>
        <h1 className="mb-6 text-center text-xl font-semibold text-zinc-200">Log in to your account</h1>
        {error && <p className="mb-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

        {step === "credentials" ? (
          <form onSubmit={submitCredentials} className="space-y-4">
            <input type="email" required placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none" />
            <input type="password" required placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none" />
            <button disabled={loading} type="submit"
              className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50">
              {loading ? "Sending code…" : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-4">
            <p className="text-sm text-zinc-400">We emailed a 6-digit code to {email}.</p>
            <input inputMode="numeric" required placeholder="123456" value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-center text-lg tracking-[0.5em] text-white focus:border-brand-500 focus:outline-none" />
            <button disabled={loading} type="submit"
              className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50">
              {loading ? "Verifying…" : "Verify & log in"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          No account? <Link href="/signup" className="text-brand-400 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
