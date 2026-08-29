"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { homePathForRole, useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";

const DEMO_ACCOUNTS = [
  {
    role: "Business owner",
    email: "ravi@srimobile.in",
    password: "OwnerPass123",
    description: "Manage Sri Mobile Store and talk to your AI employee",
  },
  {
    role: "AI trainer",
    email: "trainer@platform.in",
    password: "TrainerPass123",
    description: "Test AI routing, grounding, and tool calls across businesses",
  },
  {
    role: "Platform admin",
    email: "admin@platform.in",
    password: "AdminPass123",
    description: "Full platform access including trainer tools",
  },
];

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("ravi@srimobile.in");
  const [password, setPassword] = useState("OwnerPass123");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const user = await login(email, password);
      router.replace(homePathForRole(user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use your business or platform account. After sign-in you&apos;ll go to the dashboard that
          matches your role.
        </p>

        <div className="mt-6 space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <Button type="submit" className="mt-6 w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">How login works</h2>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>1. Enter your email and password.</li>
            <li>2. The platform checks your role.</li>
            <li>3. Business users open their store dashboard.</li>
            <li>4. Trainers and admins open the Test Lab console.</li>
          </ol>
        </section>

        <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
          <h2 className="text-sm font-semibold text-indigo-900">Demo accounts</h2>
          <ul className="mt-3 space-y-3">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email} className="rounded-xl bg-white/80 p-3 ring-1 ring-indigo-100">
                <p className="text-sm font-medium text-slate-900">{account.role}</p>
                <p className="mt-1 text-xs text-slate-500">{account.description}</p>
                <p className="mt-2 font-mono text-xs text-slate-700">{account.email}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => fillDemo(account)}
                >
                  Use this account
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
