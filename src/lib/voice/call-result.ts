import type { SupabaseClient } from "@supabase/supabase-js";

import { chargeCall } from "@/lib/billing/credits";
import { onCampaignCallFinished } from "@/lib/campaigns/engine";
import type { CallAttempt, CallTranscriptTurn, Database } from "@/lib/database.types";
import { deliverCallResult } from "@/lib/delivery/deliver";
import type { CallDetails } from "@/lib/voice/call-details";
import { sanitizeCaptureFields } from "@/lib/voice/capture-fields";
import { analyzeCall } from "@/lib/voice/summarize-call";
import { addTranscriptVersions } from "@/lib/voice/translate-transcript";

type AdminClient = SupabaseClient<Database>;

/**
 * A finished call in our own terms. Each voice provider maps its webhook or run
 * record onto this, so analysis, billing, campaigns and delivery never see a
 * provider's shape.
 */
export type CallResult = {
  status: Exclude<CallAttempt["status"], "dispatched">;
  /** Whole seconds. */
  duration: number | null;
  failureReason: string | null;
  interactionId: string | null;
  transcript: CallTranscriptTurn[] | null;
  /** Whatever the provider's agent extracted during the call. */
  finalVariables: Record<string, unknown> | null;
  /** End reason, channel, metrics; null when the provider reports none. */
  details?: CallDetails | null;
};

export type RecordableAttempt = Pick<CallAttempt, "id" | "lead_id">;

const LEAD_STATUS_BY_CALL_STATUS = {
  connected: "contacted",
  no_answer: "unreachable",
  busy: "unreachable",
  failed: "unreachable",
} as const;

/**
 * Analyses a finished call and saves it onto its attempt and lead. Returns false
 * when an earlier delivery of the same call already saved it, so the follow-up
 * work runs once per call. Throws when the save fails, so the caller can answer
 * with an error and the provider retries instead of the call being lost.
 */
export async function recordCallResult(
  supabase: AdminClient,
  attempt: RecordableAttempt,
  result: CallResult
): Promise<boolean> {
  // The fields the owner wanted at the time of the call decide what gets extracted.
  const { data: lead } = await supabase
    .from("leads")
    .select("ai_employees(capture_fields)")
    .eq("id", attempt.lead_id)
    .maybeSingle();
  const captureFields = sanitizeCaptureFields(
    (lead as { ai_employees: { capture_fields: unknown } | null } | null)?.ai_employees?.capture_fields
  );

  // Runs alongside the analysis: the turns in the call's script, in English letters and in English.
  const versioned = addTranscriptVersions(result.transcript);
  const analysis = await analyzeCall(result.transcript, result.finalVariables, captureFields);
  const transcript = await versioned;

  const { data: saved, error } = await supabase
    .from("call_attempts")
    .update({
      status: result.status,
      interaction_id: result.interactionId,
      duration: result.duration,
      failure_reason: result.failureReason,
      transcript,
      final_variables: result.finalVariables,
      summary: analysis.summary,
      visit_requested: analysis.visitRequested,
      preferred_visit_at: analysis.preferredVisitAt,
      outcome: analysis.outcome,
      sentiment: analysis.sentiment,
      unanswered_questions: analysis.unansweredQuestions,
      topics: analysis.topics,
      captured: analysis.captured,
    })
    .eq("id", attempt.id)
    .eq("status", "dispatched")
    .select("id");

  if (error) throw new Error(`Could not save call result for attempt ${attempt.id}: ${error.message}`);
  if (!saved?.length) return false;

  // Apart from the save above, so a database without the phase 20 column still keeps the call.
  if (result.details) {
    const { error: detailsError } = await supabase
      .from("call_attempts")
      .update({ call_details: result.details })
      .eq("id", attempt.id);
    if (detailsError) console.warn("[Call result] Details not saved:", detailsError.message);
  }

  await supabase
    .from("leads")
    .update({ status: LEAD_STATUS_BY_CALL_STATUS[result.status] ?? "contacted" })
    .eq("id", attempt.lead_id);
  return true;
}

/**
 * Billing, campaign progress and result delivery for a saved call. Each step is
 * independent, so one failing never stops the others.
 */
export async function afterCallRecorded(
  supabase: AdminClient,
  attempt: RecordableAttempt,
  status: CallResult["status"]
) {
  try {
    await chargeCall(supabase, attempt.id);
  } catch (err) {
    console.error("[Billing] Failed to charge attempt", attempt.id, err);
  }
  try {
    // Frees the campaign's line and schedules a retry if nobody picked up.
    await onCampaignCallFinished(supabase, attempt.lead_id, status);
  } catch (err) {
    console.error("[Campaigns] Failed to update contact for attempt", attempt.id, err);
  }
  try {
    await deliverCallResult(supabase, attempt.id);
  } catch (err) {
    console.error("[Result delivery] Failed for attempt", attempt.id, err);
  }
}
