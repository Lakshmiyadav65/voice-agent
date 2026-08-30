"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Role = "owner" | "trainer";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("owner");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Enter an email and password to continue.");
      return;
    }

    setSubmitting(true);
    // Phase 1: UI gateway only. Supabase Auth arrives in Phase 2.
    await new Promise((resolve) => setTimeout(resolve, 400));
    router.push(role === "trainer" ? "/trainer" : "/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-background p-1">
        <button
          type="button"
          onClick={() => setRole("owner")}
          className={`rounded px-3 py-2 text-sm font-medium transition ${
            role === "owner"
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          Business owner
        </button>
        <button
          type="button"
          onClick={() => setRole("trainer")}
          className={`rounded px-3 py-2 text-sm font-medium transition ${
            role === "trainer"
              ? "bg-surface text-ink shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          AI trainer
        </button>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@business.in"
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        />
      </label>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Log in"}
      </button>

      <p className="text-center text-xs leading-relaxed text-muted">
        Phase 1 login opens your workspace shell. Secure Supabase authentication
        arrives in Phase 2.
      </p>
    </form>
  );
}
