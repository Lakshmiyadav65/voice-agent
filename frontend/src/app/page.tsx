import Link from "next/link";

import { Button } from "@/components/ui/button";

const FLOW_STEPS = [
  {
    title: "Customer asks",
    body: "A caller or chat user asks about products, prices, policies, or appointments — in English, Telugu, or Tanglish.",
  },
  {
    title: "AI routes the question",
    body: "The router picks the right source: structured catalogue, knowledge documents, calendar, CRM, or WhatsApp.",
  },
  {
    title: "Business Brain answers",
    body: "The AI replies only from verified business data. Guardrails block prices or facts that are not grounded.",
  },
  {
    title: "Actions and follow-up",
    body: "The AI can book appointments, update leads, send WhatsApp details, or escalate to a human when needed.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              AI
            </div>
            <span className="text-lg font-semibold tracking-tight">AI Employee Platform</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="secondary">Sign in</Button>
            </Link>
            <Link href="/login">
              <Button>Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <section className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wider text-indigo-600">
            Managed AI for Indian businesses
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            An AI employee that knows your business
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            Give every store a voice-ready AI employee backed by a Business Brain — products, prices,
            policies, FAQs, and documents — with honest answers and human escalation when needed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login">
              <Button size="lg">Sign in to your workspace</Button>
            </Link>
            <a href="#how-it-works">
              <Button size="lg" variant="secondary">
                See how it works
              </Button>
            </a>
          </div>
        </section>

        <section id="how-it-works" className="mt-20">
          <h2 className="text-2xl font-bold text-slate-900">How customers interact with the AI</h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            Every conversation follows the same path — from question to verified answer to action.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {FLOW_STEPS.map((step, index) => (
              <article
                key={step.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20 grid gap-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-900">For business owners</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Sign in to manage your AI employee, review how it answers customers, and keep business
              information up to date.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li>Talk to your AI like a customer would</li>
              <li>See which products and policies were used</li>
              <li>Track calls, leads, and appointments (coming soon)</li>
            </ul>
            <Link href="/login" className="mt-6 inline-block">
              <Button>Business sign in</Button>
            </Link>
          </article>

          <article className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-8">
            <h3 className="text-xl font-semibold text-slate-900">For AI trainers</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Sign in to test routing, inspect grounding, review tool calls, and improve AI versions
              before deployment.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li>Test Lab with example customer questions</li>
              <li>Routing and guardrail transparency</li>
              <li>Knowledge gap review (coming soon)</li>
            </ul>
            <Link href="/login" className="mt-6 inline-block">
              <Button variant="secondary">Trainer sign in</Button>
            </Link>
          </article>
        </section>
      </main>
    </div>
  );
}
