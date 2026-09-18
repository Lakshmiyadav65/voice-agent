import { PlaceholderPanel } from "@/components/ui/PlaceholderPanel";
import { requireDashboardAccess } from "@/lib/auth/session";
import type { Business } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const session = await requireDashboardAccess();
  const supabase = await createClient();

  let businesses: Array<Business & { memberRole: string }> = [];

  if (supabase) {
    const { data: memberships } = await supabase
      .from("business_members")
      .select("role, business_id")
      .eq("user_id", session.userId);

    const businessIds = memberships?.map((row) => row.business_id) ?? [];

    if (businessIds.length > 0) {
      const { data: businessRows } = await supabase
        .from("businesses")
        .select("id, name, industry, status, phone, email, timezone, created_at, updated_at")
        .in("id", businessIds);

      businesses =
        businessRows?.map((business) => ({
          ...business,
          memberRole:
            memberships?.find((row) => row.business_id === business.id)?.role ?? "staff",
        })) ?? [];
    }
  }

  return (
    <div className="space-y-8">
      <PlaceholderPanel
        title="Dashboard"
        description="You are signed in with tenant-isolated access. Business data below is loaded through Supabase RLS — only your memberships are visible."
        notes={[
          `Signed in as ${session.profile.full_name ?? session.email}`,
          `Platform role: ${session.profile.platform_role}`,
          businesses.length
            ? `Active businesses: ${businesses.map((b) => b.name).join(", ")}`
            : "No business memberships yet — run npm run db:seed",
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Calls today", value: "—" },
          { label: "Qualified leads", value: "—" },
          { label: "WhatsApp sent", value: "—" },
          { label: "Businesses", value: String(businesses.length) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="border border-border bg-surface px-4 py-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {stat.label}
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-ink">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
