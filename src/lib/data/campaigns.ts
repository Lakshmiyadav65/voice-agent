import type { CallAttempt, Campaign, CampaignContact, Lead } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

type AttemptSlice = Pick<CallAttempt, "status" | "outcome" | "visit_requested" | "created_at">;
// Transcripts are left out on purpose: a big list would be megabytes. A row loads its calls when opened.
export type ContactWithCalls = CampaignContact & {
  leads: (Pick<Lead, "callback_at" | "callback_status"> & { call_attempts: AttemptSlice[] }) | null;
};

export type CampaignSummary = Campaign & {
  total: number;
  queued: number;
  done: number;
  pickedUp: number;
};

export type CampaignFunnel = {
  contacts: number;
  called: number;
  pickedUp: number;
  interested: number;
  visits: number;
  /** Index 0 is first attempts: how many calls went out at that try and how many were picked up. */
  byAttempt: Array<{ attempt: number; calls: number; pickedUp: number }>;
};

// Server pages only; callers have already resolved the owner's business.
function admin() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

export async function getCampaigns(businessId: string): Promise<CampaignSummary[]> {
  const supabase = admin();
  const [{ data: campaigns }, { data: contacts }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    supabase.from("campaign_contacts").select("campaign_id, status").eq("business_id", businessId).limit(20000),
  ]);

  const counts = new Map<string, { total: number; queued: number; done: number; pickedUp: number }>();
  for (const row of contacts ?? []) {
    const c = counts.get(row.campaign_id) ?? { total: 0, queued: 0, done: 0, pickedUp: 0 };
    c.total++;
    if (row.status === "queued" || row.status === "calling") c.queued++;
    else c.done++;
    if (row.status === "completed") c.pickedUp++;
    counts.set(row.campaign_id, c);
  }

  return ((campaigns as Campaign[] | null) ?? []).map((campaign) => ({
    ...campaign,
    ...(counts.get(campaign.id) ?? { total: 0, queued: 0, done: 0, pickedUp: 0 }),
  }));
}

export async function getCampaignDetail(businessId: string, campaignId: string) {
  const supabase = admin();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("business_id", businessId)
    .maybeSingle<Campaign>();
  if (!campaign) return null;

  const { data } = await supabase
    .from("campaign_contacts")
    .select("*, leads(callback_at, callback_status, call_attempts(status, outcome, visit_requested, created_at))")
    .eq("campaign_id", campaign.id)
    .order("created_at")
    .limit(5000);

  const contacts = (data as ContactWithCalls[] | null) ?? [];
  return { campaign, contacts, funnel: campaignFunnel(contacts) };
}

export function campaignFunnel(contacts: ContactWithCalls[]): CampaignFunnel {
  const byAttempt: CampaignFunnel["byAttempt"] = [];
  let called = 0;
  let pickedUp = 0;
  let interested = 0;
  let visits = 0;

  for (const contact of contacts) {
    const calls = [...(contact.leads?.call_attempts ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (calls.length) called++;
    if (calls.some((c) => c.status === "connected")) pickedUp++;
    if (calls.some((c) => c.outcome === "interested")) interested++;
    if (calls.some((c) => c.visit_requested)) visits++;

    calls.forEach((call, i) => {
      byAttempt[i] ??= { attempt: i + 1, calls: 0, pickedUp: 0 };
      byAttempt[i].calls++;
      if (call.status === "connected") byAttempt[i].pickedUp++;
    });
  }

  return { contacts: contacts.length, called, pickedUp, interested, visits, byAttempt };
}
