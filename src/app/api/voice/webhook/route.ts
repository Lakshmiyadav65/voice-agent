import { timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

import type { SarvamWebhookPayload } from "@/lib/sarvam/types";
import { createAdminClient } from "@/lib/supabase/admin";
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

    const analysis = await analyzeCall(
      payload.interaction_transcript,
      payload.final_agent_variables
    );

    await supabase
      .from("call_attempts")
      .update({
        status: payload.status,
        interaction_id: payload.interaction_id,
        duration: payload.duration,
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
      })
      .eq("id", attempt.id);

    await supabase
      .from("leads")
      .update({ status: LEAD_STATUS_BY_CALL_STATUS[payload.status] ?? "contacted" })
      .eq("id", attempt.lead_id);

    return NextResponse.json({ received: true, attempt_id: payload.attempt_id });
  } catch (err: any) {
    console.error("[Sarvam Voice Webhook] Error handling webhook:", err);
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
