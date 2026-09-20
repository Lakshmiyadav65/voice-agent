import { LeadCallCard } from "@/components/owner/LeadCallCard";
import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getBusinessLeads, latestAttempt } from "@/lib/data/leads";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerPages } from "@/lib/pages";

export default async function LeadsPage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const leads = workspace.primaryBusiness
    ? await getBusinessLeads(workspace.primaryBusiness.id)
    : [];

  return (
    <AppSectionPage meta={ownerPages.leads} showEmpty={leads.length === 0}>
      {leads.length > 0 ? (
        <div className="mt-6 space-y-4">
          {leads.map((lead) => (
            <LeadCallCard key={lead.id} lead={lead} attempt={latestAttempt(lead)} />
          ))}
        </div>
      ) : null}
    </AppSectionPage>
  );
}
