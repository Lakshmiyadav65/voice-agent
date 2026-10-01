import { timingSafeEqual } from "crypto";

import { after, NextResponse } from "next/server";

import type { SarvamWebhookPayload } from "@/lib/sarvam/types";
import { chargeCall } from "@/lib/billing/credits";
import { onCampaignCallFinished } from "@/lib/campaigns/engine";
import { deliverCallResult } from "@/lib/delivery/deliver";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeCaptureFields } from "@/lib/voice/capture-fields";
import { analyzeCall } from "@/lib/voice/summarize-call";

const LEAD_STATUS_BY_CALL_STATUS = {
  connected: "contacted",
  no_answer: "unreachable",
  busy: "unreachable",
  failed: "unreachable",
} as const;

function secretMatches(received: unknown): boolean {
  const expected = process.env.SARVAM_WEBHOOK_SECRET;
  if (!expected) return true;
  if (typeof received !== "string") return false;

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const payload: SarvamWebhookPayload = await request.json();

    if (!secretMatches(payload.webhook_config?.metadata?.webhook_secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!payload.attempt_id) {
      return NextResponse.json({ error: "Missing attempt_id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: attempt } = await supabase
      .from("call_attempts")
      .select("id, lead_id")
      .eq("attempt_id", payload.attempt_id)
      .maybeSingle();

    if (!attempt) {
      // Console-triggered test calls have no lead behind them.
      return NextResponse.json({ received: true, matched: false });
    }

    // The fields the owner wanted at the time of the call decide what gets extracted.
    const { data: lead } = await supabase
      .from("leads")
      .select("ai_employees(capture_fields)")
      .eq("id", attempt.lead_id)
      .maybeSingle();
    const captureFields = sanitizeCaptureFields(
      (lead as { ai_employees: { capture_fields: unknown } | null } | null)?.ai_employees?.capture_fields
    );

    const analysis = await analyzeCall(
      payload.interaction_transcript,
      payload.final_agent_variables,
      captureFields
    );

    const { error: saveError } = await supabase
      .from("call_attempts")
      .update({
        status: payload.status,
        interaction_id: payload.interaction_id,
        // Sarvam reports fractional seconds; the column is whole seconds.
        duration: typeof payload.duration === "number" ? Math.round(payload.duration) : null,
        failure_reason: payload.failure_reason,
        transcript: payload.interaction_transcript,
        final_variables: payload.final_agent_variables,
        summary: analysis.summary,
        visit_requested: analysis.visitRequested,
        preferred_visit_at: analysis.preferredVisitAt,
        outcome: analysis.outcome,
        sentiment: analysis.sentiment,
        unanswered_questions: analysis.unansweredQuestions,
        topics: analysis.topics,
        captured: analysis.captured,
      })
      .eq("id", attempt.id);

    if (saveError) {
      // Fail loudly so Sarvam can retry; answering 200 here silently loses the call.
      console.error("[Sarvam Voice Webhook] Could not save attempt", attempt.id, saveError, JSON.stringify(payload));
      return NextResponse.json({ error: "Could not save call result" }, { status: 500 });
    }

    await supabase
      .from("leads")
      .update({ status: LEAD_STATUS_BY_CALL_STATUS[payload.status] ?? "contacted" })
      .eq("id", attempt.lead_id);

    // Answer Sarvam first; slow or failing destinations must not delay or fail its webhook.
    after(async () => {
      try {
        await chargeCall(supabase, attempt.id);
      } catch (err) {
        console.error("[Billing] Failed to charge attempt", attempt.id, err);
      }
      try {
        // Frees the campaign's line and schedules a retry if nobody picked up.
        await onCampaignCallFinished(supabase, attempt.lead_id, payload.status);
      } catch (err) {
        console.error("[Campaigns] Failed to update contact for attempt", attempt.id, err);
      }
      try {
        await deliverCallResult(supabase, attempt.id);
      } catch (err) {
        console.error("[Result delivery] Failed for attempt", attempt.id, err);
      }
    });

    return NextResponse.json({ received: true, attempt_id: payload.attempt_id });
  } catch (err: any) {
    console.error("[Sarvam Voice Webhook] Error handling webhook:", err);
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
