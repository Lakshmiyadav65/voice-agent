import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, MetaPageConnection } from "@/lib/database.types";
import { sanitizeAttribution } from "@/lib/leads/attribution";
import { createLeadAndCall } from "@/lib/leads/create-lead";
import { fetchLead, mapLeadFields, type MetaConfig } from "@/lib/meta/graph";
import { formatE164PhoneNumber } from "@/lib/sarvam/client";

type AdminClient = SupabaseClient<Database>;

export type LeadgenChange = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
};

async function noteError(supabase: AdminClient, connectionId: string, message: string) {
  await supabase.from("meta_page_connections").update({ last_error: message }).eq("id", connectionId);
}

/**
 * One leadgen event → one lead and a call. Errors are recorded on the Page's
 * connection so the owner sees them in Settings instead of losing leads silently.
 */
export async function processLeadgen(
  supabase: AdminClient,
  config: MetaConfig,
  change: LeadgenChange,
  webhookUrl: string | undefined
) {
  if (!change.leadgen_id || !change.page_id) return;

  const { data: connection } = await supabase
    .from("meta_page_connections")
    .select("*")
    .eq("page_id", change.page_id)
    .maybeSingle<MetaPageConnection>();

  if (!connection) {
    console.warn("[Meta leads] Lead for a Page nobody has connected:", change.page_id);
    return;
  }

  let lead;
  try {
    lead = await fetchLead(config, change.leadgen_id, connection.page_access_token);
  } catch (err) {
    await noteError(supabase, connection.id, `Could not read a lead from Facebook: ${(err as Error).message}`);
    return;
  }

  const fields = mapLeadFields(lead.field_data);
  if (!fields.phone) {
    await noteError(supabase, connection.id, "A lead arrived without a phone number. Add a phone question to your lead form.");
    return;
  }

  const phone = formatE164PhoneNumber(fields.phone);
  if (!/^\+\d{8,15}$/.test(phone)) {
    await noteError(supabase, connection.id, `A lead's phone number could not be read: "${fields.phone.slice(0, 30)}".`);
    return;
  }
  const source = lead.platform === "ig" ? "instagram" : "facebook";

  const result = await createLeadAndCall(supabase, {
    businessId: connection.business_id,
    name: fields.name?.slice(0, 200) || "Facebook lead",
    phone,
    email: fields.email?.slice(0, 254) ?? null,
    enquiry: fields.enquiry?.slice(0, 500) ?? null,
    source,
    utm: sanitizeAttribution({
      utm_source: source,
      utm_medium: lead.is_organic ? "organic" : "paid",
      utm_campaign: lead.campaign_name,
      utm_content: lead.ad_name,
    }),
    externalId: `meta:${change.leadgen_id}`,
    webhookUrl,
  });

  if (!result.ok) {
    await noteError(supabase, connection.id, result.error);
    return;
  }

  await supabase
    .from("meta_page_connections")
    .update({ last_lead_at: new Date().toISOString(), last_error: null })
    .eq("id", connection.id);
}
