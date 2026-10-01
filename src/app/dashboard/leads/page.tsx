import Link from "next/link";

import { LeadCallCard } from "@/components/owner/LeadCallCard";
import { SourceBreakdownTable } from "@/components/owner/SourceBreakdownTable";
import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getBusinessLeads, latestAttempt, sourceBreakdown } from "@/lib/data/leads";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerPages } from "@/lib/pages";

export default async function LeadsPage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const leads = workspace.primaryBusiness
    ? await getBusinessLeads(workspace.primaryBusiness.id)
    : [];
  const breakdown = sourceBreakdown(leads);

  return (
    <AppSectionPage meta={ownerPages.leads} showEmpty={leads.length === 0}>
      {leads.length > 0 ? (
        <div className="mt-6 space-y-10">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Where your leads come from
            </h2>
            <p className="mt-1 text-sm text-muted">
              Each ad you run shows up as its own row.{" "}
              <Link href="/dashboard/settings" className="font-semibold text-accent hover:underline">
                Get a tagged ad link
              </Link>{" "}
              so new ads are tracked too.
            </p>
            <div className="mt-4">
              <SourceBreakdownTable rows={breakdown} />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              All leads
            </h2>
            <div className="mt-4 space-y-4">
              {leads.map((lead) => (
                <LeadCallCard key={lead.id} lead={lead} attempt={latestAttempt(lead)} />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </AppSectionPage>
  );
}
