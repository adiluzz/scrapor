"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { signIn } from "next-auth/react";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      setStep("code");
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        code,
        mode: "signup",
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid or expired code");
        return;
      }
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        <div className="mb-6 flex justify-center">
          <Logo href="/" />
        </div>
        <h1 className="mb-6 text-center text-xl font-semibold text-zinc-200">Create your account</h1>
        {error && <p className="mb-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

        {step === "credentials" ? (
          <form onSubmit={register} className="space-y-4">
            <input type="email" required placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none" />
            <input type="password" required minLength={8} placeholder="Password (min 8 chars)" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none" />
            <p className="text-xs text-zinc-500">You must be 18+ to create an account.</p>
            <button disabled={loading} type="submit"
              className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50">
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-zinc-400">Enter the 6-digit code we emailed to {email}.</p>
            <input inputMode="numeric" required placeholder="123456" value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-center text-lg tracking-[0.5em] text-white focus:border-brand-500 focus:outline-none" />
            <button disabled={loading} type="submit"
              className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50">
              {loading ? "Verifying…" : "Verify & continue"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account? <Link href="/login" className="text-brand-400 hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
