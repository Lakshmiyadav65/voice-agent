import Link from "next/link";

import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_0%_0%,#daf0e8_0%,transparent_55%),radial-gradient(ellipse_60%_40%_at_100%_100%,#e7eee9_0%,transparent_50%)]"
      />
      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="font-display text-2xl font-semibold tracking-tight text-ink">
          AI Employee
        </Link>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-muted transition hover:text-accent"
        >
          Go to dashboard
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md border border-border bg-surface p-8 shadow-[0_20px_50px_rgba(7,26,20,0.06)]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            Welcome back
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
            Log in
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Access your business dashboard or trainer console.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </main>
    </div>
  );
}
