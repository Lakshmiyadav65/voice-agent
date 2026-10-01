import { headers } from "next/headers";

import { AdLinkBuilder } from "@/components/owner/AdLinkBuilder";
import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import { ownerPages } from "@/lib/pages";

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
    </AppSectionPage>
  );
}
