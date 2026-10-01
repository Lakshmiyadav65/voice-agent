import { CallFilters } from "@/components/owner/CallFilters";
import { LeadCallCard } from "@/components/owner/LeadCallCard";
import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { StatCard } from "@/components/ui/StatCard";
import { requireDashboardAccess } from "@/lib/auth/session";
import { summarizeAttempts } from "@/lib/data/call-analytics";
import { getBusinessLeads, latestAttempt, type LeadWithCalls } from "@/lib/data/leads";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { formatSeconds } from "@/lib/format";
import { campaignOf, sourceLabel } from "@/lib/leads/attribution";
import { ownerPages } from "@/lib/pages";

const OUTCOME_LABELS: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  callback_requested: "Callback requested",
  wrong_number: "Wrong number",
  no_answer: "No answer",
  unclear: "Unclear",
};

const ANALYTICS_LEAD_LIMIT = 1000;
const LIST_LIMIT = 50;

function formatDuration(seconds: number): string {
  return seconds ? formatSeconds(seconds) : "—";
}

function param(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function distinct(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CallsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const current = {
    source: param(query.source),
    campaign: param(query.campaign),
    outcome: param(query.outcome),
  };

  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const allLeads: LeadWithCalls[] = workspace.primaryBusiness
    ? await getBusinessLeads(workspace.primaryBusiness.id, ANALYTICS_LEAD_LIMIT)
    : [];
  const called = allLeads.filter((lead) => lead.call_attempts?.length);

  // Options come from the unfiltered set so picking one filter never hides the others' choices.
  const sources = distinct(called.map((lead) => lead.source)).map((value) => ({
    value,
    label: sourceLabel(value),
  }));
  const campaigns = distinct(called.map((lead) => campaignOf(lead.utm))).map((value) => ({
    value,
    label: value,
  }));
  const outcomes = distinct(
    called.flatMap((lead) => lead.call_attempts.map((a) => a.outcome ?? undefined))
  ).map((value) => ({ value, label: OUTCOME_LABELS[value] ?? value }));

  const leads = called.filter(
    (lead) =>
      (!current.source || lead.source === current.source) &&
      (!current.campaign || campaignOf(lead.utm) === current.campaign) &&
      (!current.outcome || lead.call_attempts.some((a) => a.outcome === current.outcome))
  );
  const attempts = leads.flatMap((lead) =>
    lead.call_attempts.filter((a) => !current.outcome || a.outcome === current.outcome)
  );
  const stats = summarizeAttempts(attempts);
  const hasCalls = called.length > 0;

  return (
    <AppSectionPage meta={ownerPages.calls} showEmpty={!hasCalls}>
      {hasCalls ? (
        <div className="mt-6 space-y-8">
          <CallFilters
            sources={sources}
            campaigns={campaigns}
            outcomes={outcomes}
            current={current}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total calls" value={String(stats.total)} />
            <StatCard
              label="Picked up"
              value={stats.total ? `${Math.round(stats.connectRate * 100)}%` : "—"}
              hint={`${stats.connected} of ${stats.total}`}
            />
            <StatCard
              label="Avg duration"
              value={formatDuration(stats.avgDurationSeconds)}
              hint="Calls that were picked up"
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

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Calls{leads.length > LIST_LIMIT ? ` (latest ${LIST_LIMIT} of ${leads.length})` : ` (${leads.length})`}
            </h2>
            {leads.length > 0 ? (
              <div className="mt-4 space-y-4">
                {leads.slice(0, LIST_LIMIT).map((lead) => (
                  <LeadCallCard key={lead.id} lead={lead} attempt={latestAttempt(lead)} />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted">
                No calls match these filters.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </AppSectionPage>
  );
}
