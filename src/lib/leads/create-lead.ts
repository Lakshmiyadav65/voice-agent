import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { Attribution } from "@/lib/leads/attribution";
import { dispatchLeadCall } from "@/lib/voice/dispatch-lead-call";

type AdminClient = SupabaseClient<Database>;

export type NewLead = {
  businessId: string;
  /** Untrusted when it comes from a browser; only used if it belongs to the business. */
  aiEmployeeId?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  enquiry?: string | null;
  source: string;
  utm: Attribution;
  ipHash?: string | null;
  /** Platform id (e.g. a Meta leadgen id) so a redelivered lead is not called twice. */
  externalId?: string | null;
  webhookUrl?: string;
};

export type CreateLeadResult =
  | { ok: true; leadId: string; called: boolean; duplicate?: false }
  | { ok: true; leadId: string; called: false; duplicate: true }
  | { ok: false; error: string };

/** The employee that answers for a business: the requested one if it is theirs, else their first. */
async function resolveEmployeeId(
  supabase: AdminClient,
  businessId: string,
  requested?: string | null
): Promise<string | null> {
  if (requested) {
    const { data } = await supabase
      .from("ai_employees")
      .select("id")
      .eq("id", requested)
      .eq("business_id", businessId)
      .maybeSingle();
    if (data) return data.id;
  }

  const { data } = await supabase
    .from("ai_employees")
    .select("id")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * The one path every lead takes — hosted form, client site or Meta lead ad —
 * so saving, calling and status tracking can never drift between sources.
 * Callers validate and throttle first; this assumes the input is clean.
 */
export async function createLeadAndCall(
  supabase: AdminClient,
  input: NewLead
): Promise<CreateLeadResult> {
  if (input.externalId) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("business_id", input.businessId)
      .eq("external_id", input.externalId)
      .maybeSingle();
    if (existing) return { ok: true, leadId: existing.id, called: false, duplicate: true };
  }

  const aiEmployeeId = await resolveEmployeeId(supabase, input.businessId, input.aiEmployeeId);

  const { data: lead, error: insertError } = await supabase
    .from("leads")
    .insert({
      business_id: input.businessId,
      ai_employee_id: aiEmployeeId,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      enquiry: input.enquiry ?? null,
      source: input.source,
      utm: input.utm,
      ip_hash: input.ipHash ?? null,
      external_id: input.externalId ?? null,
      status: "new",
    })
    .select("id")
    .single();

  if (insertError || !lead) {
    // A concurrent redelivery can win the race to the unique index; treat it as the duplicate it is.
    if (insertError?.code === "23505" && input.externalId) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("business_id", input.businessId)
        .eq("external_id", input.externalId)
        .maybeSingle();
      if (existing) return { ok: true, leadId: existing.id, called: false, duplicate: true };
    }
    return { ok: false, error: "Could not record the lead." };
  }

  const result = await dispatchLeadCall({
    aiEmployeeId,
    customerName: input.name,
    phoneNumber: input.phone,
    reason: input.enquiry ?? undefined,
    leadId: lead.id,
    webhookUrl: input.webhookUrl,
  });

  if (!result.success) {
    // The lead is already saved, so the business can still follow up by hand.
    await supabase.from("leads").update({ status: "unreachable" }).eq("id", lead.id);
    return { ok: true, leadId: lead.id, called: false };
  }

  await supabase.from("call_attempts").insert({
    lead_id: lead.id,
    business_id: input.businessId,
    attempt_id: result.attemptId!,
    status: "dispatched",
  });
  await supabase.from("leads").update({ status: "calling" }).eq("id", lead.id);

  return { ok: true, leadId: lead.id, called: true };
}
