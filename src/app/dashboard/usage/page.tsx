import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { StatCard } from "@/components/ui/StatCard";
import { requireDashboardAccess } from "@/lib/auth/session";
import { formatRupees, isBillingEnforced } from "@/lib/billing/credits";
import { getUsage } from "@/lib/data/usage";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerPages } from "@/lib/pages";

const KIND_LABELS = { topup: "Top-up", call_charge: "Call", adjustment: "Adjustment" } as const;

const DAY_LABEL = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function UsagePage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const usage = workspace.primaryBusiness ? await getUsage(workspace.primaryBusiness.id) : null;

  if (!usage) return <AppSectionPage meta={ownerPages.usage} showEmpty={false} />;

  const minutesLeft = usage.ratePaise ? Math.floor(Math.max(0, usage.balancePaise) / usage.ratePaise) : null;
  const low = minutesLeft !== null && minutesLeft < 10;
  const activeDays = usage.days.filter((d) => d.calls > 0);

  return (
    <AppSectionPage meta={ownerPages.usage} showEmpty={false}>
      {low ? (
        <p className="mb-6 rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          {minutesLeft === 0 ? "You're out of call credits" : `Only about ${minutesLeft} minutes of calling left`}.{" "}
          {isBillingEnforced()
            ? "New leads won't be called until you top up — contact us to add credits."
            : "Contact us to add credits."}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Balance"
          value={formatRupees(usage.balancePaise)}
          hint={minutesLeft === null ? undefined : `About ${minutesLeft} min of calling`}
        />
        <StatCard label="Rate" value={`${formatRupees(usage.ratePaise)}/min`} hint="Connected minutes only" />
        <StatCard label="This month" value={formatRupees(usage.month.spendPaise)} hint={`${usage.month.minutes} min over ${usage.month.calls} calls`} />
        <StatCard label="Unanswered calls" value="Free" hint="Ring time is never charged" />
      </div>

      <p className="mt-4 text-xs text-muted">
        Each connected call is charged for every started minute — a 1 min 10 s call counts as 2 minutes.
      </p>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Last 30 days</h2>
        {activeDays.length ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="bg-background text-left text-xs uppercase tracking-[0.1em] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Day</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Billed calls</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Minutes</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {activeDays.map((d) => (
                  <tr key={d.day}>
                    <td className="px-4 py-2.5 text-ink">{DAY_LABEL.format(new Date(`${d.day}T00:00:00Z`))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.calls}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.minutes}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatRupees(d.spendPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted">
            No billed calls in the last 30 days.
          </p>
        )}
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Credit history</h2>
        {usage.ledger.length ? (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
            {usage.ledger.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-ink">{KIND_LABELS[entry.kind]}</span>
                  {entry.note ? <span className="ml-2 text-muted">{entry.note}</span> : null}
                  <span className="block text-xs text-muted">
                    {new Date(entry.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
                <span className={`tabular-nums font-semibold ${entry.amount_paise >= 0 ? "text-accent" : "text-foreground"}`}>
                  {entry.amount_paise >= 0 ? "+" : "−"}
                  {formatRupees(Math.abs(entry.amount_paise))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted">
            No top-ups or charges yet.
          </p>
        )}
      </section>
    </AppSectionPage>
  );
}
