"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { redirectPathForRole } from "@/lib/auth/roles";
import type { PlatformRole } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

const demoAccounts = [
  { label: "Business owner", email: "ravi@srimobile.in", password: "OwnerPass123" },
  { label: "AI trainer", email: "trainer@platform.in", password: "TrainerPass123" },
  { label: "Admin", email: "admin@platform.in", password: "AdminPass123" },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabaseReady = isSupabaseConfigured();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Enter an email and password to continue.");
      return;
    }

    if (!supabaseReady) {
      setError("Supabase is not configured. Copy .env.example to .env.local and add your project keys.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Could not connect to Supabase.");
      return;
    }

    setSubmitting(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setSubmitting(false);
      setError(signInError?.message ?? "Sign in failed. Check your credentials.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("platform_role")
      .eq("id", data.user.id)
      .maybeSingle();

    const platformRole = (profile as { platform_role: PlatformRole } | null)
      ?.platform_role;

    if (!platformRole) {
      setSubmitting(false);
      setError("Signed in, but no profile was found. Run the Phase 2 seed script.");
      return;
    }

    router.push(redirectPathForRole(platformRole));
    router.refresh();
  }

  function fillDemo(account: (typeof demoAccounts)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-5">
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
      </form>

      <div className="border-t border-border pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Demo accounts
        </p>
        <ul className="mt-3 space-y-2">
          {demoAccounts.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => fillDemo(account)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm transition hover:border-accent"
              >
                <span className="font-medium text-foreground">{account.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{account.email}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Run <code className="rounded bg-background px-1 py-0.5">npm run db:seed</code> after
          applying migrations to create these users.
        </p>
      </div>
    </div>
  );
}
