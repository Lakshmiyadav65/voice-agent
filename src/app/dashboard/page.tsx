import Link from "next/link";

import { AiEmployeeStatusCard } from "@/components/owner/AiEmployeeStatusCard";
import { LeadCallCard } from "@/components/owner/LeadCallCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getCallStats } from "@/lib/data/call-analytics";
import { getBusinessLeads, latestAttempt } from "@/lib/data/leads";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerPages } from "@/lib/pages";

const RECENT_LEADS = 3;

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

  const [stats, leads] = business
    ? await Promise.all([getCallStats(business.id), getBusinessLeads(business.id)])
    : [null, []];

  const interested = stats?.outcomes.find((row) => row.label === "interested")?.count ?? 0;
  const recentLeads = leads.slice(0, RECENT_LEADS);

  return (
    <div>
      <PageHeader
        title={ownerPages.dashboard.title}
        description={ownerPages.dashboard.description}
      />

      <section>
        <SectionHeading
          title="Results"
          description="What your AI employee has done with the leads from your ads."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Leads" value={String(leads.length)} hint="Form submissions" />
          <StatCard
            label="Calls made"
            value={String(stats?.total ?? 0)}
            hint={
              stats?.total
                ? `${Math.round(stats.connectRate * 100)}% picked up`
                : "No calls yet"
            }
          />
          <StatCard label="Interested" value={String(interested)} hint="From call analysis" />
          <StatCard
            label="Visit requests"
            value={String(stats?.visitRequests ?? 0)}
            hint="Asked to visit or book"
          />
        </div>
      </section>

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
