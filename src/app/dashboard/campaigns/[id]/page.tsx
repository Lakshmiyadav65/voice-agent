import { notFound } from "next/navigation";

import { CampaignContacts } from "@/components/campaigns/CampaignContacts";
import { CampaignControls } from "@/components/campaigns/CampaignControls";
import { CampaignStatusBadge } from "@/components/campaigns/CampaignStatusBadge";
import { LiveRefresh } from "@/components/campaigns/LiveRefresh";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { canManageBusiness } from "@/lib/auth/access";
import { requireDashboardAccess } from "@/lib/auth/session";
import { isWithinWindow } from "@/lib/campaigns/engine";
import { getCampaignDetail } from "@/lib/data/campaigns";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

type PageProps = { params: Promise<{ id: string }> };

export default async function CampaignPage({ params }: PageProps) {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const business = workspace.primaryBusiness;
  if (!business) notFound();

  const detail = await getCampaignDetail(business.id, (await params).id);
  if (!detail) notFound();

  const { campaign, contacts, funnel } = detail;
  const admin = createAdminClient();
  const canManage = admin ? await canManageBusiness(admin, session, business.id) : false;
  const callable = contacts.filter((c) => c.status !== "do_not_call").length;
  const inHours = isWithinWindow(campaign);
  // Callbacks can still be due after the list itself is done.
  const live =
    campaign.status === "running" ||
    contacts.some((c) => c.leads?.callback_status === "scheduled" || c.leads?.callback_status === "calling");

  return (
    <div>
      {live ? <LiveRefresh seconds={10} /> : null}
      <PageHeader
        title={campaign.name}
        description={`Calls ${campaign.window_start.slice(0, 5)}–${campaign.window_end.slice(0, 5)} IST · up to ${campaign.max_concurrent} at a time · ${campaign.max_attempts} ${campaign.max_attempts === 1 ? "try" : "tries"} per number, ${campaign.retry_after_minutes >= 1440 ? "next day" : `${campaign.retry_after_minutes} min`} apart`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Campaigns", href: "/dashboard/campaigns" },
          { label: campaign.name },
        ]}
        actions={
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <CampaignStatusBadge status={campaign.status} />
            {canManage ? <CampaignControls campaign={campaign} contacts={callable} /> : null}
          </div>
        }
      />

      {campaign.status === "running" && !inHours ? (
        <p className="mb-6 rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-warn">
          Outside calling hours right now. Calls resume automatically at {campaign.window_start.slice(0, 5)}.
        </p>
      ) : null}

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Funnel</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Contacts" value={String(funnel.contacts)} hint={`${callable} callable`} />
          <StatCard label="Called" value={String(funnel.called)} hint={`${pct(funnel.called, callable)} of list`} />
          <StatCard label="Picked up" value={String(funnel.pickedUp)} hint={`${pct(funnel.pickedUp, funnel.called)} connect rate`} />
          <StatCard label="Interested" value={String(funnel.interested)} hint={`${pct(funnel.interested, funnel.pickedUp)} of picked up`} />
          <StatCard label="Visit requests" value={String(funnel.visits)} />
        </div>

        {funnel.byAttempt.length > 0 ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[24rem] text-sm">
              <thead className="bg-background text-left text-xs uppercase tracking-[0.1em] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Try</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Calls</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Picked up</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Connect rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {funnel.byAttempt.map((row) => (
                  <tr key={row.attempt}>
                    <td className="px-4 py-2.5 text-ink">{row.attempt === 1 ? "First call" : `Retry ${row.attempt - 1}`}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.calls}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.pickedUp}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{pct(row.pickedUp, row.calls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Contacts ({contacts.length})</h2>
        <CampaignContacts contacts={contacts} campaignId={campaign.id} canManage={canManage} timeZone={campaign.time_zone} />
      </section>
    </div>
  );
}
