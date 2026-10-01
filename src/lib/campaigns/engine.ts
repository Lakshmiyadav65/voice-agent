import type { SupabaseClient } from "@supabase/supabase-js";

import type { Campaign, CampaignContact, Database } from "@/lib/database.types";
import { createLeadAndCall, placeCallForLead, resolveEmployeeId } from "@/lib/leads/create-lead";

type AdminClient = SupabaseClient<Database>;

// A call whose webhook never arrives must not hold a concurrency slot forever.
const STALE_CALL_MINUTES = 30;

/** "HH:MM" now in the campaign's zone; Postgres `time` columns compare as strings. */
function localTime(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

export function isWithinWindow(campaign: Pick<Campaign, "window_start" | "window_end" | "time_zone">, now = new Date()) {
  const current = localTime(campaign.time_zone, now);
  return current >= campaign.window_start.slice(0, 5) && current < campaign.window_end.slice(0, 5);
}

function addMinutes(minutes: number, from = new Date()): string {
  return new Date(from.getTime() + minutes * 60_000).toISOString();
}

/**
 * What happens to a contact after a call ends: done if picked up, otherwise
 * queued again until the campaign's attempt limit is reached.
 */
function nextState(campaign: Campaign, contact: CampaignContact, callStatus: string) {
  if (callStatus === "connected") return { status: "completed" as const };
  if (contact.attempts < campaign.max_attempts) {
    return { status: "queued" as const, next_attempt_at: addMinutes(campaign.retry_after_minutes) };
  }
  return { status: (callStatus === "failed" ? "failed" : "unreachable") as CampaignContact["status"] };
}

async function finishIfDone(supabase: AdminClient, campaignId: string) {
  const { count } = await supabase
    .from("campaign_contacts")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "calling"]);

  if ((count ?? 0) === 0) {
    await supabase
      .from("campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("status", "running");
  }
}

/** Called from the Sarvam webhook once a campaign contact's call has a result. */
export async function onCampaignCallFinished(supabase: AdminClient, leadId: string, callStatus: string) {
  const { data: contact } = await supabase
    .from("campaign_contacts")
    .select("*")
    .eq("lead_id", leadId)
    .eq("status", "calling")
    .maybeSingle<CampaignContact>();
  if (!contact) return;

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", contact.campaign_id)
    .single<Campaign>();
  if (!campaign) return;

  await supabase
    .from("campaign_contacts")
    .update({ ...nextState(campaign, contact, callStatus), last_call_status: callStatus })
    .eq("id", contact.id);
  await finishIfDone(supabase, campaign.id);
}

async function dialContact(
  supabase: AdminClient,
  campaign: Campaign,
  aiEmployeeId: string | null,
  contact: CampaignContact,
  webhookUrl: string | undefined
): Promise<{ ok: boolean; error?: string; leadId?: string }> {
  if (contact.lead_id) {
    const result = await placeCallForLead(supabase, {
      leadId: contact.lead_id,
      businessId: campaign.business_id,
      aiEmployeeId,
      name: contact.name,
      phone: contact.phone,
      enquiry: contact.notes,
      webhookUrl,
    });
    return result.ok ? { ok: true, leadId: contact.lead_id } : { ok: false, error: result.error, leadId: contact.lead_id };
  }

  const result = await createLeadAndCall(supabase, {
    businessId: campaign.business_id,
    aiEmployeeId,
    name: contact.name,
    phone: contact.phone,
    enquiry: contact.notes,
    source: "campaign",
    utm: { utm_source: "campaign", utm_medium: "outbound", utm_campaign: campaign.name.slice(0, 200) },
    externalId: `campaign:${contact.id}`,
    webhookUrl,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return result.called ? { ok: true, leadId: result.leadId } : { ok: false, error: "Call could not be placed", leadId: result.leadId };
}

async function tickCampaign(supabase: AdminClient, campaign: Campaign, webhookUrl: string | undefined) {
  const now = new Date();

  // Release slots held by calls that never reported back, counting them as unanswered.
  const { data: stale } = await supabase
    .from("campaign_contacts")
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("status", "calling")
    .lt("updated_at", addMinutes(-STALE_CALL_MINUTES, now));
  for (const contact of (stale as CampaignContact[] | null) ?? []) {
    await supabase
      .from("campaign_contacts")
      .update({ ...nextState(campaign, contact, "no_answer"), last_error: "No result came back for this call" })
      .eq("id", contact.id)
      .eq("status", "calling");
  }

  if (!isWithinWindow(campaign, now)) return { campaignId: campaign.id, dialled: 0, reason: "outside calling hours" };

  const { count: active } = await supabase
    .from("campaign_contacts")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("status", "calling");
  const slots = campaign.max_concurrent - (active ?? 0);
  if (slots <= 0) return { campaignId: campaign.id, dialled: 0, reason: "all lines busy" };

  const { data: due } = await supabase
    .from("campaign_contacts")
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("status", "queued")
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at")
    .limit(slots);

  const aiEmployeeId = await resolveEmployeeId(supabase, campaign.business_id, campaign.ai_employee_id);
  let dialled = 0;

  const dueContacts = (due as CampaignContact[] | null) ?? [];
  // Checked at dial time too: a number may be blocked after the list was uploaded.
  const { data: blocked } = dueContacts.length
    ? await supabase
        .from("do_not_call")
        .select("phone")
        .eq("business_id", campaign.business_id)
        .in("phone", dueContacts.map((c) => c.phone))
    : { data: [] };
  const blockedPhones = new Set((blocked ?? []).map((row) => row.phone));

  for (const contact of dueContacts) {
    if (blockedPhones.has(contact.phone)) {
      await supabase.from("campaign_contacts").update({ status: "do_not_call" }).eq("id", contact.id);
      continue;
    }

    // Claim with a conditional update, so two overlapping ticks never dial the same person.
    const { data: claimed } = await supabase
      .from("campaign_contacts")
      .update({ status: "calling", attempts: contact.attempts + 1, last_error: null })
      .eq("id", contact.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle<CampaignContact>();
    if (!claimed) continue;

    const result = await dialContact(supabase, campaign, aiEmployeeId, claimed, webhookUrl);
    if (result.ok) {
      dialled++;
      if (result.leadId && !claimed.lead_id) {
        await supabase.from("campaign_contacts").update({ lead_id: result.leadId }).eq("id", claimed.id);
      }
    } else {
      await supabase
        .from("campaign_contacts")
        .update({
          ...nextState(campaign, claimed, "failed"),
          lead_id: result.leadId ?? claimed.lead_id,
          last_error: result.error ?? "Call could not be placed",
        })
        .eq("id", claimed.id);
    }
  }

  await finishIfDone(supabase, campaign.id);
  return { campaignId: campaign.id, dialled };
}

/** One scheduler pass over every running campaign (or just one, when an owner presses Start). */
export async function runCampaignTick(
  supabase: AdminClient,
  options: { campaignId?: string; webhookUrl?: string } = {}
) {
  let query = supabase.from("campaigns").select("*").eq("status", "running");
  if (options.campaignId) query = query.eq("id", options.campaignId);
  const { data: campaigns } = await query;

  const results = [];
  for (const campaign of (campaigns as Campaign[] | null) ?? []) {
    try {
      results.push(await tickCampaign(supabase, campaign, options.webhookUrl));
    } catch (err) {
      console.error("[Campaigns] Tick failed for", campaign.id, err);
      results.push({ campaignId: campaign.id, dialled: 0, reason: "error" });
    }
  }
  return results;
}
