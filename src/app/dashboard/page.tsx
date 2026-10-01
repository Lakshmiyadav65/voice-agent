import Link from "next/link";

import { ActivityChart } from "@/components/owner/ActivityChart";
import { AiEmployeeStatusCard } from "@/components/owner/AiEmployeeStatusCard";
import { LeadCallCard } from "@/components/owner/LeadCallCard";
import { SourceBreakdownTable } from "@/components/owner/SourceBreakdownTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireDashboardAccess } from "@/lib/auth/session";
import { canPlaceCall, getBalancePaise, isBillingEnforced } from "@/lib/billing/credits";
import { summarizeAttempts } from "@/lib/data/call-analytics";
import {
  dailyActivity,
  getBusinessLeads,
  istDay,
  istToday,
  latestAttempt,
  medianSecondsToCall,
  sourceBreakdown,
} from "@/lib/data/leads";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { formatSeconds } from "@/lib/format";
import { ownerPages } from "@/lib/pages";
import { createAdminClient } from "@/lib/supabase/admin";

const RECENT_LEADS = 3;
const CHART_DAYS = 14;
const TOP_SOURCES = 5;
// Enough history for two weeks of charts without paging.
const ANALYTICS_LEAD_LIMIT = 1000;

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const business = workspace.primaryBusiness;
  const primaryEmployee = workspace.aiEmployees[0] ?? null;

  const leads = business ? await getBusinessLeads(business.id, ANALYTICS_LEAD_LIMIT) : [];
  // Derived from the same rows as the chart so every number on the page agrees.
  const stats = summarizeAttempts(leads.flatMap((lead) => lead.call_attempts ?? []));

  const today = istToday();
  const leadsToday = leads.filter((lead) => istDay(lead.created_at) === today);
  const interested = stats.outcomes.find((row) => row.label === "interested")?.count ?? 0;
  const medianWait = medianSecondsToCall(leads);
  const days = dailyActivity(leads, CHART_DAYS);
  const sources = sourceBreakdown(leads);
  const recentLeads = leads.slice(0, RECENT_LEADS);

  // Only worth interrupting the owner when an empty wallet actually stops calls.
  const admin = createAdminClient();
  const outOfCredit =
    business && admin && isBillingEnforced() ? !(await canPlaceCall(admin, business.id)).ok : false;
  const balancePaise = outOfCredit && admin && business ? await getBalancePaise(admin, business.id) : null;

  return (
    <div>
      <PageHeader
        title={ownerPages.dashboard.title}
        description={ownerPages.dashboard.description}
      />

      {outOfCredit ? (
        <p className="mb-8 rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          Your AI employee has stopped calling: call credits have run out
          {balancePaise !== null && balancePaise > 0 ? " (less than one minute left)" : ""}. New leads are
          saved but not called.{" "}
          <Link href="/dashboard/usage" className="font-semibold underline">
            See usage
          </Link>
        </p>
      ) : null}

      <section>
        <SectionHeading
          title="Results"
          description={`What your AI employee has done with your leads. The chart covers the last ${CHART_DAYS} days.`}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Leads today"
            value={String(leadsToday.length)}
            hint={`${leads.length} in total`}
          />
          <StatCard
            label="Pick-up rate"
            value={stats.total ? `${Math.round(stats.connectRate * 100)}%` : "—"}
            hint={stats.total ? `${stats.connected} of ${stats.total} calls` : "No calls yet"}
          />
          <StatCard
            label="Interested"
            value={String(interested)}
            hint={`${stats.visitRequests ?? 0} asked to visit`}
          />
          <StatCard
            label="Time to call"
            value={medianWait === null ? "—" : formatSeconds(medianWait)}
            hint="Typical wait from form to call"
          />
        </div>

        <div className="mt-6">
          <ActivityChart days={days} />
        </div>
      </section>

      {sources.length > 0 ? (
        <section className="mt-10 border-t border-border pt-8">
          <div className="flex items-start justify-between gap-4">
            <SectionHeading
              title="Where your leads come from"
              description="Which ads bring leads, and how many of them pick up and show interest."
            />
            {sources.length > TOP_SOURCES ? (
              <Link
                href="/dashboard/leads"
                className="shrink-0 text-sm font-semibold text-accent hover:underline"
              >
                All {sources.length} sources →
              </Link>
            ) : null}
          </div>
          <SourceBreakdownTable rows={sources.slice(0, TOP_SOURCES)} />
        </section>
      ) : null}

      <section className="mt-10 border-t border-border pt-8">
        <div className="flex items-start justify-between gap-4">
          <SectionHeading
            title="Recent leads"
            description="The latest people who filled your form, and what happened on their call."
          />
          {leads.length > RECENT_LEADS ? (
            <Link
              href="/dashboard/leads"
              className="shrink-0 text-sm font-semibold text-accent hover:underline"
            >
              View all {leads.length} →
            </Link>
          ) : null}
        </div>
        {recentLeads.length > 0 ? (
          <div className="space-y-4">
            {recentLeads.map((lead) => (
              <LeadCallCard key={lead.id} lead={lead} attempt={latestAttempt(lead)} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted">
            No leads yet. Share your lead form below, or use it as the link in your ads.
          </p>
        )}
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <SectionHeading
          title="Set up"
          description="Your AI employee and the form your ads send people to."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <AiEmployeeStatusCard employee={primaryEmployee} businessName={business?.name} />

          <div className="border border-border bg-surface p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Your lead form
            </p>
            {business ? (
              <>
                <p className="mt-2 text-sm text-muted">
                  Use this page as the link in your Facebook or Google ads. Everyone who fills it
                  in gets a call from your AI employee within seconds.
                </p>
                <code className="mt-4 block break-all rounded bg-background px-3 py-2 text-xs text-ink">
                  /f/{business.id}
                </code>
                <Link
                  href={`/f/${business.id}`}
                  target="_blank"
                  className="mt-4 inline-flex text-sm font-semibold text-accent hover:underline"
                >
                  Open form →
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Your form appears here once your business is set up.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
