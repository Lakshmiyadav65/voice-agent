import Link from "next/link";

import { SiteHeader } from "@/components/shell/SiteHeader";

const conversation = [
  {
    who: "Customer",
    text: "iPhone 15 price entha?",
    note: "Tanglish · price intent",
  },
  {
    who: "AI Employee",
    text: "₹15,000 for the 128GB model — live from your Business Brain.",
    note: "Structured price lookup",
  },
  {
    who: "Customer",
    text: "Pixel 9 stock lo undha?",
    note: "Inventory check",
  },
  {
    who: "AI Employee",
    text: "Yes — 5 units available right now. Shall I WhatsApp the details?",
    note: "Inventory + action offer",
  },
];

const capabilities = [
  {
    title: "Voice that switches languages",
    body: "English, Telugu, and Tanglish in the same call — natural code-switching, not a rigid script.",
  },
  {
    title: "Answers from live business data",
    body: "Prices, stock, offers, and FAQs come from the Business Brain at runtime — never from a frozen prompt.",
  },
  {
    title: "Actions mid-conversation",
    body: "Send WhatsApp details, capture leads, book appointments, or transfer to a human when needed.",
  },
  {
    title: "Change facts without retraining",
    body: "Schedule a new price for 2 PM. Before 2 PM the AI quotes the old one; after, the new one — no model rewrite.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-full bg-background">
      <SiteHeader />

      <main>
        {/* —— Hero —— */}
        <section className="relative min-h-[100svh] overflow-hidden bg-hero-deep text-white">
          <div
            aria-hidden
            className="animate-drift absolute inset-0 bg-[radial-gradient(ellipse_85%_65%_at_78%_35%,#117a5c_0%,transparent_52%),radial-gradient(ellipse_55%_45%_at_8%_90%,#1d6b54_0%,transparent_48%),linear-gradient(155deg,#02140f_0%,#0a4536_48%,#052920_100%)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.09]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.45) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Dominant visual: waveform + quote */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] items-center justify-center lg:flex"
          >
            <div className="relative w-full max-w-md pr-10">
              <div className="mb-10 flex h-24 items-end justify-center gap-1.5">
                {[18, 34, 52, 28, 64, 40, 22].map((h, i) => (
                  <span
                    key={i}
                    className="wave-bar w-2.5 rounded-full bg-hero-lime/80"
                    style={{ height: `${h}px` }}
                  />
                ))}
              </div>
              <p className="animate-rise text-center font-display text-[2.1rem] font-semibold leading-[1.2] text-white/30 xl:text-[2.45rem]">
                “iPhone 15 price entha?”
              </p>
              <p className="animate-rise-delay mt-5 text-center font-display text-[2.1rem] font-semibold leading-[1.2] text-hero-lime xl:text-[2.45rem]">
                “₹15,000 — from your Business Brain.”
              </p>
              <svg
                className="mx-auto mt-8 h-8 w-48 text-hero-lime/50"
                viewBox="0 0 192 32"
                fill="none"
                aria-hidden
              >
                <path
                  className="path-draw"
                  d="M4 22 C40 6, 70 28, 96 14 S152 4, 188 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          <div className="relative z-10 flex min-h-[100svh] flex-col justify-end px-6 pb-16 pt-28 md:justify-center md:px-12 md:pb-24 lg:max-w-[54%]">
            <p className="animate-rise font-display text-[3.25rem] font-semibold leading-none tracking-tight text-white sm:text-6xl md:text-7xl lg:text-[5.25rem]">
              AI Employee
            </p>
            <h1 className="animate-rise-delay mt-7 max-w-lg text-[1.65rem] font-medium leading-snug text-white md:text-3xl">
              A voice employee that sells and supports from your real business
              facts.
            </h1>
            <p className="animate-rise-delay-2 mt-4 max-w-md text-base leading-relaxed text-white/68 md:text-lg">
              Built for Indian businesses — Telugu, English, WhatsApp, and live
              prices without teaching owners how to train AI.
            </p>
            <div className="animate-rise-delay-2 mt-9 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-md bg-hero-lime px-6 py-3.5 text-sm font-semibold text-ink transition hover:brightness-105"
              >
                Log in
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-white/22 bg-white/[0.06] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/12"
              >
                Open dashboard
              </Link>
            </div>
          </div>
        </section>

        {/* —— Problem —— */}
        <section className="border-b border-border bg-sand">
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-12 md:py-20">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              Missed calls. Repeated questions. Slow follow-ups.
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
              High-enquiry businesses lose customers when nobody answers in
              Telugu, when prices are outdated, or when WhatsApp details never
              leave the call. Generic AI chatbots force owners to become AI
              engineers. This platform does not.
            </p>
          </div>
        </section>

        {/* —— Business Brain —— */}
        <section className="mx-auto max-w-5xl px-6 py-16 md:px-12 md:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            The differentiator
          </p>
          <h2 className="mt-3 max-w-3xl font-display text-3xl font-semibold tracking-tight text-ink md:text-5xl md:leading-[1.1]">
            Business Brain keeps facts separate from conversation style.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            Structured products, prices, stock, offers, FAQs, and documents live
            in one place. The AI employee retrieves them on every turn. Change a
            price at 2 PM — the next caller hears the new number. No retraining.
          </p>

          <div className="mt-12 grid gap-x-10 gap-y-8 border-t border-border pt-10 md:grid-cols-3">
            {[
              {
                label: "Structured data",
                items: "Products · Variants · Prices · Inventory · Offers",
              },
              {
                label: "Knowledge",
                items: "FAQs · Policies · Documents · Website copy",
              },
              {
                label: "Rules",
                items: "Escalation · Allowed actions · Restrictions",
              },
            ].map((block) => (
              <div key={block.label}>
                <h3 className="font-display text-xl font-semibold text-ink">
                  {block.label}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {block.items}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* —— Conversation —— */}
        <section
          id="how-it-works"
          className="border-y border-border bg-surface"
        >
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-12 md:py-24">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              A real conversation, not a script tree.
            </h2>
            <p className="mt-3 max-w-2xl text-muted leading-relaxed">
              Every answer is grounded in a fresh lookup. Follow-ups do not
              invent numbers. WhatsApp only confirms after the send is accepted.
            </p>

            <ol className="mt-12 space-y-0">
              {conversation.map((turn, index) => (
                <li
                  key={turn.text}
                  className="grid gap-2 border-t border-border py-6 md:grid-cols-[7rem_1fr_11rem] md:gap-6 md:py-7"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                    {String(index + 1).padStart(2, "0")} · {turn.who}
                  </span>
                  <p className="font-display text-xl font-semibold leading-snug text-ink md:text-2xl">
                    {turn.text}
                  </p>
                  <p className="text-sm text-muted md:text-right">{turn.note}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* —— Dynamic price —— */}
        <section className="bg-ink text-white">
          <div className="mx-auto grid max-w-5xl gap-12 px-6 py-16 md:grid-cols-2 md:items-center md:px-12 md:py-24">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Schedule ₹15,000 → ₹17,000 for 2:00 PM.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-white/65">
                At 1:59 the AI still quotes ₹15,000. At 2:01 it quotes ₹17,000.
                The authoritative value lives in the database — not inside model
                weights.
              </p>
            </div>
            <div className="space-y-4 font-display text-2xl font-semibold md:text-3xl">
              <p className="text-white/35">1:59 PM → ₹15,000</p>
              <p className="text-hero-lime">2:01 PM → ₹17,000</p>
              <p className="pt-2 text-sm font-sans font-medium uppercase tracking-[0.16em] text-white/45">
                Model retraining · not required
              </p>
            </div>
          </div>
        </section>

        {/* —— Capabilities —— */}
        <section className="mx-auto max-w-5xl px-6 py-16 md:px-12 md:py-24">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            What your AI employee actually does.
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            {capabilities.map((item) => (
              <div key={item.title} className="border-t border-border pt-6">
                <h3 className="font-display text-xl font-semibold text-ink">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* —— Two roles —— */}
        <section className="border-t border-border bg-sand">
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-12 md:py-24">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              Owners manage facts. Trainers manage the AI.
            </h2>
            <p className="mt-4 max-w-2xl text-muted leading-relaxed">
              That split is the product. Business users never see prompts,
              embeddings, or model settings. Complexity stays with the internal
              trainer console.
            </p>

            <div className="mt-12 grid gap-12 md:grid-cols-2">
              <div>
                <h3 className="font-display text-2xl font-semibold text-ink">
                  Business owner
                </h3>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-foreground md:text-base">
                  <li>See calls, transcripts, leads, WhatsApp, appointments</li>
                  <li>Edit prices, stock, offers, and FAQs</li>
                  <li>Upload documents and schedule future changes</li>
                  <li>Never configure the model</li>
                </ul>
                <Link
                  href="/login"
                  className="mt-6 inline-flex text-sm font-semibold text-accent hover:underline"
                >
                  Log in to dashboard →
                </Link>
              </div>
              <div>
                <h3 className="font-display text-2xl font-semibold text-ink">
                  Internal AI trainer
                </h3>
                <ul className="mt-5 space-y-3 text-sm leading-relaxed text-foreground md:text-base">
                  <li>Prepare the Business Brain and AI behaviour</li>
                  <li>Run Test Lab scenarios before anything goes live</li>
                  <li>Close knowledge gaps from failed conversations</li>
                  <li>Version, approve, deploy, and roll back</li>
                </ul>
                <Link
                  href="/login"
                  className="mt-6 inline-flex text-sm font-semibold text-accent hover:underline"
                >
                  Log in to trainer console →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* —— CTA —— */}
        <section className="bg-hero-deep text-white">
          <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16 md:flex-row md:items-end md:justify-between md:px-12 md:py-20">
            <div className="max-w-xl">
              <p className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
                AI Employee
              </p>
              <p className="mt-4 text-base leading-relaxed text-white/65 md:text-lg">
                Log in to your workspace, or open the dashboard to explore the
                owner shell while authentication lands in the next phase.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-md bg-hero-lime px-6 py-3.5 text-sm font-semibold text-ink transition hover:brightness-105"
              >
                Log in
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
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
