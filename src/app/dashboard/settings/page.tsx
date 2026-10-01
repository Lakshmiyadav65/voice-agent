import { headers } from "next/headers";

import { AdLinkBuilder } from "@/components/owner/AdLinkBuilder";
import { DeliverySettings } from "@/components/owner/DeliverySettings";
import { MetaLeadAds, type MetaPageSummary } from "@/components/owner/MetaLeadAds";
import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { canManageBusiness } from "@/lib/auth/access";
import { requireDashboardAccess } from "@/lib/auth/session";
import { getOwnerWorkspace } from "@/lib/data/workspace";
import type { DeliveryTarget } from "@/lib/database.types";
import { isEmailConfigured } from "@/lib/delivery/channels";
import { getMetaConfig } from "@/lib/meta/graph";
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

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Turns the Facebook connect redirect's query into a message for the owner. */
function metaNotice(query: Record<string, string | string[] | undefined>): {
  tone: "good" | "bad";
  text: string;
} | null {
  const get = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : undefined);
  switch (get("meta")) {
    case "connected": {
      const count = Number(get("pages") ?? 0);
      const skipped = get("skipped");
      return {
        tone: count ? "good" : "bad",
        text:
          `${count ? `Connected ${count} Page${count === 1 ? "" : "s"}. New lead ad submissions will now be called automatically.` : "No Pages were connected."}` +
          (skipped ? ` Skipped (already linked to another business): ${skipped}.` : ""),
      };
    }
    case "cancelled":
      return { tone: "bad", text: "Facebook connection was cancelled." };
    case "no_pages":
      return { tone: "bad", text: "No Pages were shared. Connect again and tick the Page your ads run from." };
    case "not_owner":
      return { tone: "bad", text: "Only the business owner can connect a Facebook Page." };
    case "not_configured":
      return { tone: "bad", text: "Connecting Facebook isn't switched on for this platform yet." };
    case "error":
      return { tone: "bad", text: `Could not connect Facebook: ${get("reason") ?? "unknown error"}` };
    default:
      return null;
  }
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const session = await requireDashboardAccess();
  const workspace = await getOwnerWorkspace(session.userId);
  const business = workspace.primaryBusiness;

  const admin = createAdminClient();
  const [targets, canManage, metaPages] =
    business && admin
      ? await Promise.all([
          admin
            .from("delivery_targets")
            .select("*")
            .eq("business_id", business.id)
            .order("created_at")
            .then(({ data }) => (data as DeliveryTarget[] | null) ?? []),
          canManageBusiness(admin, session, business.id),
          // Never the token: only the columns safe to render.
          admin
            .from("meta_page_connections")
            .select("id, page_name, last_lead_at, last_error, created_at")
            .eq("business_id", business.id)
            .order("created_at")
            .then(({ data }) => (data as MetaPageSummary[] | null) ?? []),
        ])
      : [[], false, []];

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

      <section id="lead-ads" className="mt-10 scroll-mt-6 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Facebook &amp; Instagram lead ads
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          When someone fills the form inside a Facebook or Instagram ad, your AI employee calls them
          straight away — no website needed.
        </p>
        {business ? (
          <MetaLeadAds
            configured={Boolean(getMetaConfig())}
            canManage={canManage}
            initialPages={metaPages}
            notice={metaNotice(query)}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border px-5 py-6 text-sm text-muted">
            Available once your business is set up.
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
