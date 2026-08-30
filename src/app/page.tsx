import Link from "next/link";

import { SiteHeader } from "@/components/shell/SiteHeader";

export default function HomePage() {
  return (
    <div className="min-h-full bg-background">
      <SiteHeader />

      <main>
        {/* Hero: brand + one headline + one line + CTAs + full-bleed visual */}
        <section className="relative min-h-[100svh] overflow-hidden bg-hero-deep text-white">
          <div
            aria-hidden
            className="animate-drift absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_70%_40%,#0f6b52_0%,transparent_55%),radial-gradient(ellipse_60%_50%_at_15%_85%,#1a8f6e_0%,transparent_50%),linear-gradient(160deg,#031a14_0%,#0a4a3a_55%,#063528_100%)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />

          {/* Dominant visual plane: live call dialogue */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-[18%] right-[6%] hidden w-[40%] flex-col justify-end gap-5 lg:flex"
          >
            <p className="animate-rise max-w-[88%] font-display text-3xl font-semibold leading-snug text-white/35 xl:text-4xl">
              “iPhone 15 price entha?”
            </p>
            <p className="animate-rise-delay max-w-[92%] self-end text-right font-display text-3xl font-semibold leading-snug text-hero-lime xl:text-4xl">
              “₹15,000 — from your Business Brain.”
            </p>
            <p className="animate-rise-delay-2 flex items-center justify-end gap-3 text-xs uppercase tracking-[0.18em] text-white/45">
              <span className="animate-pulse-line h-1.5 w-1.5 rounded-full bg-hero-lime" />
              Live voice · Telugu + English
            </p>
          </div>

          <div className="relative z-10 flex min-h-[100svh] max-w-5xl flex-col justify-end px-6 pb-16 pt-28 md:justify-center md:px-10 md:pb-24 md:pt-24 lg:max-w-[52%]">
            <p className="animate-rise font-display text-5xl font-semibold tracking-tight text-white sm:text-6xl md:text-7xl">
              AI Employee
            </p>
            <h1 className="animate-rise-delay mt-6 max-w-xl text-2xl font-medium leading-snug text-white/95 md:text-3xl">
              Hire a voice employee that answers from your real business facts.
            </h1>
            <p className="animate-rise-delay-2 mt-4 max-w-md text-base leading-relaxed text-white/70 md:text-lg">
              Owners manage prices and stock. Trainers prepare the AI. No guessing —
              no model retraining for every change.
            </p>
            <div className="animate-rise-delay-2 mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-md bg-hero-lime px-6 py-3.5 text-sm font-semibold text-ink transition hover:brightness-105"
              >
                Log in
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-white/25 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Open dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            One employee. Two doors in.
          </h2>
          <p className="mt-3 max-w-2xl text-muted leading-relaxed">
            Get to work from the landing page — sign in for your role, or jump
            straight into the dashboard shell while we wire up full authentication.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <div className="border-t border-border pt-6">
              <h3 className="font-display text-xl font-semibold text-ink">
                Business owner
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Review calls, leads, WhatsApp, and appointments. Update products,
                prices, and offers without touching AI internals.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline"
              >
                Log in to dashboard →
              </Link>
            </div>
            <div className="border-t border-border pt-6">
              <h3 className="font-display text-xl font-semibold text-ink">
                AI trainer
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Configure behaviour, run the Test Lab, close knowledge gaps, and
                deploy only versions that pass.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline"
              >
                Log in to trainer console →
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-12 md:flex-row md:items-center md:justify-between md:px-10">
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink">
                Ready to manage your AI employee?
              </h2>
              <p className="mt-1 text-sm text-muted">
                Log in to continue, or open the dashboard now.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent"
              >
                Log in
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-border px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
              >
                Open dashboard
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
