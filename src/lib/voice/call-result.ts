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
  /** When the call started (ISO), so a callback time the customer gave can be worked out. */
  startedAt?: string | null;
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
    .select("ai_employees(capture_fields), businesses(timezone)")
    .eq("id", attempt.lead_id)
    .maybeSingle();
  const joined = lead as {
    ai_employees: { capture_fields: unknown } | null;
    businesses: { timezone: string | null } | null;
  } | null;
  const captureFields = sanitizeCaptureFields(joined?.ai_employees?.capture_fields);

  const analysis = await analyzeCall(result.transcript, result.finalVariables, captureFields, {
    startedAt: result.startedAt,
    timeZone: joined?.businesses?.timezone,
  });

  const { data: saved, error } = await supabase
    .from("call_attempts")
    .update({
      status: result.status,
      interaction_id: result.interactionId,
      duration: result.duration,
      failure_reason: result.failureReason,
      transcript: result.transcript,
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

  // Apart from the save above, so a database without the phase 21 columns still keeps the call.
  if (analysis.callbackAt) {
    const { error: callbackError } = await supabase
      .from("leads")
      .update({ callback_at: analysis.callbackAt, callback_status: "scheduled" })
      .eq("id", attempt.lead_id);
    if (callbackError) console.warn("[Call result] Callback not scheduled:", callbackError.message);
  }
  return true;
}

/**
 * Billing, campaign progress, result delivery and the transcript's readable versions for a
 * saved call. Each step is independent, so one failing never stops the others.
 */
export async function afterCallRecorded(supabase: AdminClient, attempt: RecordableAttempt, result: CallResult) {
  try {
    await chargeCall(supabase, attempt.id);
  } catch (err) {
    console.error("[Billing] Failed to charge attempt", attempt.id, err);
  }
  try {
    // Frees the campaign's line and schedules a retry if nobody picked up.
    await onCampaignCallFinished(supabase, attempt.lead_id, result.status);
  } catch (err) {
    console.error("[Campaigns] Failed to update contact for attempt", attempt.id, err);
  }
  try {
    await deliverCallResult(supabase, attempt.id);
  } catch (err) {
    console.error("[Result delivery] Failed for attempt", attempt.id, err);
  }
  try {
    // Last and apart from the analysis, which shares the model's rate limit and matters more.
    // A call this misses reads as said until npm run calls:resync fills it in.
    const transcript = await addTranscriptVersions(result.transcript);
    if (transcript?.some((turn) => turn.english)) {
      const { error } = await supabase.from("call_attempts").update({ transcript }).eq("id", attempt.id);
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    console.error("[Transcript versions] Failed for attempt", attempt.id, err);
  }
}
