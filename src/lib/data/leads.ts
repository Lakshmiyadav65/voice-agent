import type { CallAttempt, Lead } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type LeadWithCalls = Lead & { call_attempts: CallAttempt[] };

export async function getBusinessLeads(businessId: string): Promise<LeadWithCalls[]> {
  const supabase = await createClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("leads")
    .select("*, call_attempts(*)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (data as LeadWithCalls[] | null) ?? [];
}

/** The most recent attempt carries the summary worth showing. */
export function latestAttempt(lead: LeadWithCalls): CallAttempt | null {
  if (!lead.call_attempts?.length) return null;

  return [...lead.call_attempts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]!;
}

export async function getVisitRequests(businessId: string): Promise<LeadWithCalls[]> {
  const leads = await getBusinessLeads(businessId);
  return leads.filter((lead) =>
    lead.call_attempts?.some((attempt) => attempt.visit_requested)
  );
}
