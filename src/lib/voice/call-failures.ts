import type { SupabaseClient } from "@supabase/supabase-js";

import { OUT_OF_CREDITS } from "@/lib/billing/credits";
import type { CallFailure, Database } from "@/lib/database.types";

export type CallFailureReason = CallFailure["reason"];

/** What each reason means for staff, and what fixes it. */
export const CALL_FAILURE_INFO: Record<CallFailureReason, { label: string; action: string }> = {
  no_credits: {
    label: "Client is out of call credits",
    action: "Top up this client's credits under Manage call credits.",
  },
  no_balance: {
    label: "Sarvam wallet is out of balance",
    action: "Top up the wallet in Sarvam's console. Every client's calls stop until then.",
  },
  agent: {
    label: "Problem with the Sarvam agent",
    action: "Check the agent ID linked to this client in /admin, and that the agent is committed in Sarvam's console.",
  },
  number: {
    label: "Number or connection rejected",
    action:
      "Check that SARVAM_CONNECTION_ID and SARVAM_AGENT_PHONE_NUMBER belong to the same Sarvam account as the API key, and that the customer's number is valid.",
  },
  auth: {
    label: "Sarvam rejected our API key",
    action: "Check that SARVAM_API_KEY, SARVAM_ORG_ID and SARVAM_WORKSPACE_ID all come from the same Sarvam account.",
  },
  settings: {
    label: "Sarvam settings are missing",
    action: "Fill in the missing SARVAM_ value named in the message, in .env.local (or Vercel's settings once deployed).",
  },
  network: {
    label: "Could not reach Sarvam",
    action: "Usually brief. If it keeps happening, check Sarvam's status and this server's internet access.",
  },
  other: {
    label: "Sarvam refused the call",
    action: "Read Sarvam's message below for the cause.",
  },
};

/**
 * Sorts an error from placing a call into a reason staff can act on. The messages come
 * from our credit check, our Sarvam client's own setting checks, or Sarvam's API (which
 * our client prefixes with "Sarvam API error (<status>)").
 */
export function classifyCallError(message: string): CallFailureReason {
  if (message === OUT_OF_CREDITS) return "no_credits";
  if (/SARVAM_[A-Z_]+/.test(message) && /required|missing|not configured/i.test(message)) return "settings";
  if (/\(402\)|insufficient balance|wallet/i.test(message)) return "no_balance";
  if (/\((401|403)\)|api key|unauthori[sz]ed|forbidden/i.test(message)) return "auth";
  if (/agent|app_id|\bapp\b|version|commit/i.test(message)) return "agent";
  if (/connection|phone|number|endpoint|e\.164/i.test(message)) return "number";
  // Anything else that is not Sarvam's own answer is a request that never got through.
  if (!message.startsWith("Sarvam API error") && !/no call id/i.test(message)) return "network";
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
