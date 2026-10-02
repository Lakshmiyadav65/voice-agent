import { timingSafeEqual } from "crypto";

import { after, NextResponse } from "next/server";

import type { SarvamWebhookPayload } from "@/lib/sarvam/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { afterCallRecorded, recordCallResult } from "@/lib/voice/call-result";

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

    let saved: boolean;
    try {
      saved = await recordCallResult(supabase, attempt, {
        status: payload.status,
        interactionId: payload.interaction_id,
        // Sarvam reports fractional seconds; the column is whole seconds.
        duration: typeof payload.duration === "number" ? Math.round(payload.duration) : null,
        failureReason: payload.failure_reason,
        transcript: payload.interaction_transcript,
        finalVariables: payload.final_agent_variables,
      });
    } catch (err) {
      // Fail loudly so Sarvam can retry; answering 200 here silently loses the call.
      console.error("[Sarvam Voice Webhook]", err, JSON.stringify(payload));
      return NextResponse.json({ error: "Could not save call result" }, { status: 500 });
    }

    // Answer Sarvam first; slow or failing destinations must not delay or fail its webhook.
    if (saved) after(() => afterCallRecorded(supabase, attempt, payload.status));

    return NextResponse.json({ received: true, attempt_id: payload.attempt_id });
  } catch (err: any) {
    console.error("[Sarvam Voice Webhook] Error handling webhook:", err);
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
