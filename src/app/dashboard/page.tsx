import Link from "next/link";

import { AiEmployeeStatusCard } from "@/components/owner/AiEmployeeStatusCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerPages } from "@/lib/pages";

export default async function DashboardPage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const primaryEmployee = workspace.aiEmployees[0] ?? null;

  return (
    <div>
      <PageHeader
        title={ownerPages.dashboard.title}
        description={ownerPages.dashboard.description}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <AiEmployeeStatusCard
          employee={primaryEmployee}
          businessName={workspace.primaryBusiness?.name}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Calls today" value="—" hint="Phase 10" />
          <StatCard label="Qualified leads" value="—" hint="Phase 12" />
          <StatCard label="WhatsApp sent" value="—" hint="Phase 11" />
          <StatCard label="Appointments" value="—" hint="Phase 12" />
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="AI performance"
          value="—"
          hint="Evaluation in Phase 8+"
        />
        <StatCard
          label="Businesses"
          value={String(workspace.businesses.length)}
        />
        <StatCard
          label="Products"
          value="—"
          hint="Phase 5"
        />
        <StatCard
          label="Knowledge docs"
          value="—"
          hint="Phase 6"
        />
      </div>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Quick actions
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/dashboard/business/products"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
          >
            Manage products
          </Link>
          <Link
            href="/dashboard/calls"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
          >
            View calls
          </Link>
          <Link
            href="/dashboard/leads"
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
          >
            View leads
          </Link>
        </div>
      </section>
    </div>
  );
}
