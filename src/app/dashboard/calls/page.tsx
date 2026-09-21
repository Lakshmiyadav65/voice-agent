import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { StatCard } from "@/components/ui/StatCard";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getCallStats } from "@/lib/data/call-analytics";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerPages } from "@/lib/pages";

const OUTCOME_LABELS: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  callback_requested: "Callback requested",
  wrong_number: "Wrong number",
  no_answer: "No answer",
  unclear: "Unclear",
};

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
}

export default async function CallsPage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const stats = workspace.primaryBusiness
    ? await getCallStats(workspace.primaryBusiness.id)
    : null;

  const hasCalls = Boolean(stats?.total);

  return (
    <AppSectionPage meta={ownerPages.calls} showEmpty={!hasCalls}>
      {stats && hasCalls ? (
        <div className="mt-6 space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total calls" value={String(stats.total)} />
            <StatCard
              label="Connected"
              value={`${Math.round(stats.connectRate * 100)}%`}
              hint={`${stats.connected} of ${stats.total}`}
            />
            <StatCard
              label="Avg duration"
              value={formatDuration(stats.avgDurationSeconds)}
              hint="Connected calls only"
            />
            <StatCard label="Visit requests" value={String(stats.visitRequests)} />
          </div>

          {stats.outcomes.length > 0 ? (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Outcomes
              </h2>
              <ul className="mt-4 space-y-2">
                {stats.outcomes.map((row) => {
                  const share = stats.total ? Math.round((row.count / stats.total) * 100) : 0;
                  return (
                    <li key={row.label} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 text-sm text-foreground">
                        {OUTCOME_LABELS[row.label] ?? row.label}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-border/40">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(share, 2)}%` }}
                        />
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs text-muted">
                        {row.count} · {share}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {stats.topTopics.length > 0 ? (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                What customers asked about
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {stats.topTopics.map((topic) => (
                  <span
                    key={topic.topic}
                    className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
                  >
                    {topic.topic}
                    <span className="ml-2 text-xs text-muted">{topic.count}</span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </AppSectionPage>
  );
}
