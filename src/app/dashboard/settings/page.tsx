import { headers } from "next/headers";

import { AdLinkBuilder } from "@/components/owner/AdLinkBuilder";
import { DeliverySettings } from "@/components/owner/DeliverySettings";
import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { canManageBusiness } from "@/lib/auth/access";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import type { DeliveryTarget } from "@/lib/database.types";
import { isEmailConfigured } from "@/lib/delivery/channels";
import { ownerPages } from "@/lib/pages";
import { createAdminClient } from "@/lib/supabase/admin";

/** Ads must point at the public address, not whatever host the owner is browsing from. */
async function publicBaseUrl(): Promise<string> {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function SettingsPage() {
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const business = workspace.primaryBusiness;

  const admin = createAdminClient();
  const [targets, canManage] =
    business && admin
      ? await Promise.all([
          admin
            .from("delivery_targets")
            .select("*")
            .eq("business_id", business.id)
            .order("created_at")
            .then(({ data }) => (data as DeliveryTarget[] | null) ?? []),
          canManageBusiness(admin, session, business.id),
        ])
      : [[], false];

  return (
    <AppSectionPage meta={ownerPages.settings} showEmpty={false}>
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Ad links
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Build the link to put in your ads, so you can see which ad each lead came from.
        </p>
        {business ? (
          <AdLinkBuilder formUrl={`${await publicBaseUrl()}/f/${business.id}`} />
        ) : (
          <p className="rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted">
            Your ad links appear here once your business is set up.
          </p>
        )}
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Where call results go
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          After every call, send the summary and outcome to your email, a Google Sheet, or your own
          system — so you don&apos;t have to keep checking this dashboard.
        </p>
        {business ? (
          <DeliverySettings
            initialTargets={targets}
            canManage={canManage}
            emailConfigured={isEmailConfigured()}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted">
            Available once your business is set up.
          </p>
        )}
      </section>
    </AppSectionPage>
  );
}
