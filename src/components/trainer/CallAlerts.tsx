import Link from "next/link";
import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadCallHealth, type CallHealth } from "@/lib/voice/call-health";

// The banner (in the layout) and the panel (on /admin) render in the same request; read once.
const getCallHealth = cache(async (): Promise<CallHealth | null> => {
  const supabase = createAdminClient();
  return supabase ? loadCallHealth(supabase) : null;
});

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Shown on every staff page: red while a client's calls are failing, amber while an
 * agent is not receiving its knowledge base. Silent when all is well.
 */
export async function CallAlertBanner() {
  const health = await getCallHealth();
  if (!health) return null;
  const noKnowledge = health.warnings.filter((w) => w.missingKnowledge);
  if (!health.failing.length && !noKnowledge.length) return null;

  return (
    <div className="mb-6 space-y-3">
      {health.failing.length ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">
            Calls are failing for {health.failing.length} {health.failing.length === 1 ? "client" : "clients"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {health.failing.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.businessName}:</span> {p.label} ({when(p.at)}). {p.action}
              </li>
            ))}
          </ul>
          <Link href="/admin#call-problems" className="mt-2 inline-block font-semibold underline">
            See all call problems
          </Link>
        </div>
      ) : null}

      {noKnowledge.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            {noKnowledge.map((w) => w.businessName).join(", ")}: the agent is not receiving the knowledge base
          </p>
          <p className="mt-1">
            Its Sarvam agent has no <code>business_description</code> variable, so calls go out without the client&apos;s
            prices and project details. In Sarvam&apos;s console, add that variable, put <code>@business_description</code>{" "}
            in the agent&apos;s prompt, and commit the agent. This clears after the next call.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The full list on /admin: every call in the last 7 days that did not go out or did not connect. */
export async function CallProblemsPanel() {
  const health = await getCallHealth();
  if (!health) return null;

  return (
    <section id="call-problems" className="mt-10 scroll-mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Call problems, last 7 days ({health.problems.length})
      </h2>
      {!health.ready ? (
        <p className="mb-3 text-sm text-warn">
          Calls that never went out are not being recorded yet. Apply the phase 16 database migration (supabase db push).
        </p>
      ) : null}
      {health.warnings.some((w) => !w.missingKnowledge) ? (
        <ul className="mb-3 space-y-1 text-sm text-muted">
          {health.warnings
            .filter((w) => !w.missingKnowledge)
            .map((w) => (
              <li key={w.businessId}>
                {w.businessName}: the last call went out without {w.variables.join(", ")}, which its Sarvam agent does not define.
              </li>
            ))}
        </ul>
      ) : null}
      {health.problems.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {health.problems.map((p) => (
            <li key={p.id} className="space-y-1 p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p>
                  <span className={`font-semibold ${p.kind === "refused" ? "text-red-700" : "text-amber-800"}`}>{p.label}</span>
                  <span className="text-muted">
                    {" "}
                    · {p.businessName}
                    {p.leadName || p.leadPhone ? ` · ${[p.leadName, p.leadPhone].filter(Boolean).join(", ")}` : ""}
                  </span>
                </p>
                <p className="text-xs text-muted">{when(p.at)}</p>
              </div>
              <p className="text-foreground">{p.action}</p>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">Message from the system</summary>
                <p className="mt-1 break-words font-mono">{p.message}</p>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No call problems in the last 7 days.</p>
      )}
    </section>
  );
}
