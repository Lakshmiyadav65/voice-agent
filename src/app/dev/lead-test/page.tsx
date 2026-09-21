import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { LeadTestForm } from "./LeadTestForm";

export default async function LeadTestPage() {
  // Placing real calls from an unauthenticated page is a development affordance only.
  if (process.env.NODE_ENV === "production") notFound();

  const supabase = createAdminClient();
  const { data: business } = supabase
    ? await supabase.from("businesses").select("id, name").limit(1).maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
        Development only
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">
        Lead intake test
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Posts to <code className="rounded bg-surface px-1 py-0.5">/api/leads/intake</code> exactly
        as a client&apos;s ad form would. A successful submission places a real phone call to the
        number you enter, so use your own.
      </p>

      {business ? (
        <p className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm">
          Prefilled with <strong className="text-ink">{business.name}</strong>
        </p>
      ) : (
        <p className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
          No business found — paste a business ID manually.
        </p>
      )}

      <LeadTestForm businessId={business?.id ?? ""} />
    </main>
  );
}
