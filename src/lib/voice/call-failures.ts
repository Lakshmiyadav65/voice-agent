import type { SupabaseClient } from "@supabase/supabase-js";

import { OUT_OF_CREDITS } from "@/lib/billing/credits";
import type { CallFailure, Database } from "@/lib/database.types";
import { NO_VOICE_PROVIDER } from "@/lib/voice/dispatch-lead-call";

export type CallFailureReason = CallFailure["reason"];

/** What each reason means for staff, and what fixes it. */
export const CALL_FAILURE_INFO: Record<CallFailureReason, { label: string; action: string }> = {
  no_credits: {
    label: "Client is out of call credits",
    action: "Top up this client's credits under Manage call credits.",
  },
  no_balance: {
    label: "Voice provider account is out of balance",
    action: "Top up the voice provider's account. Every client's calls stop until then.",
  },
  agent: {
    label: "Problem with the voice agent",
    action: "Check that this client's agent exists and is published in the voice provider's console.",
  },
  number: {
    label: "Number or connection rejected",
    action: "Check the calling number set up with the voice provider, and that the customer's number is valid.",
  },
  auth: {
    label: "Voice provider rejected our API key",
    action: "Check the voice provider's API key in Vercel's environment settings.",
  },
  settings: {
    label: "No voice provider connected",
    action: "Calls are paused until Cartesia is connected. Leads are still saved, so owners can call them by hand.",
  },
  network: {
    label: "Could not reach the voice provider",
    action: "Usually brief. If it keeps happening, check the provider's status page.",
  },
  other: {
    label: "Voice provider refused the call",
    action: "Read the provider's message below for the cause.",
  },
};

/** Sorts an error from placing a call into a reason staff can act on. */
export function classifyCallError(message: string): CallFailureReason {
  if (message === OUT_OF_CREDITS) return "no_credits";
  if (message === NO_VOICE_PROVIDER) return "settings";
  if (/\(402\)|insufficient balance|wallet/i.test(message)) return "no_balance";
  if (/\((401|403)\)|api key|unauthori[sz]ed|forbidden/i.test(message)) return "auth";
  if (/agent|version/i.test(message)) return "agent";
  if (/connection|phone|number|e\.164/i.test(message)) return "number";
  if (/fetch failed|timed? ?out|ECONN|ENOTFOUND|network/i.test(message)) return "network";
  return "other";
}

/**
 * Records a call that never went out. Never throws: a missing table (before the phase 16
 * migration) or a failed insert must not turn one failure into two.
 */
export async function recordCallFailure(
  supabase: SupabaseClient<Database>,
  failure: { businessId: string; aiEmployeeId: string | null; leadId: string | null; error: string }
): Promise<void> {
  try {
    const { error } = await supabase.from("call_failures").insert({
      business_id: failure.businessId,
      ai_employee_id: failure.aiEmployeeId,
      lead_id: failure.leadId,
      reason: classifyCallError(failure.error),
      message: failure.error.slice(0, 2000),
    });
    if (error) console.warn("[Call failures] Could not record:", error.message);
  } catch (err) {
    console.warn("[Call failures] Could not record:", (err as Error).message);
  }
}
