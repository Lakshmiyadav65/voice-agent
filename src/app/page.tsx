import Link from "next/link";

import { SiteHeader } from "@/components/shell/SiteHeader";

export default function HomePage() {
  return (
    <div className="min-h-full bg-background">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-border">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_10%_0%,#d8efe6_0%,transparent_55%),radial-gradient(ellipse_70%_50%_at_90%_20%,#e8eef4_0%,transparent_50%)]"
          />
          <div className="relative mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16 md:px-10 md:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              AI Employee Platform
            </p>
            <h1 className="max-w-3xl font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl md:leading-[1.1]">
              An AI employee that answers from your business facts — not from guesses.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted">
              Business owners manage prices, stock, offers, and documents. Internal AI
              trainers prepare behaviour, tests, and versions. The Business Brain keeps
              current facts separate from conversation style.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent"
              >
                Open business dashboard
              </Link>
              <Link
                href="/trainer"
                className="rounded-md border border-border bg-surface px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
              >
                Open trainer console
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-10 px-6 py-14 md:grid-cols-2 md:px-10 md:py-16">
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">
              Business owner
            </h2>
            <p className="mt-3 text-muted leading-relaxed">
              Manage an employee, not a model. Update approved business information,
              review calls and leads, and schedule price or stock changes without
              retraining.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-foreground">
              <li>Dashboard, calls, leads, WhatsApp, appointments</li>
              <li>Business information: products, offers, FAQs, documents</li>
              <li>No prompts, embeddings, or provider settings</li>
            </ul>
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold text-ink">
              Internal AI trainer
            </h2>
            <p className="mt-3 text-muted leading-relaxed">
              Prepare the Business Brain, configure behaviour, run the Test Lab, close
              knowledge gaps, and deploy only versions that pass evaluation.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-foreground">
              <li>Knowledge, configuration, conversations, versions</li>
              <li>Test Lab and knowledge-gap workflow</li>
              <li>Approve, deploy, and roll back safely</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
