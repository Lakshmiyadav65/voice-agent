import { timingSafeEqual } from "crypto";

import { after, NextResponse } from "next/server";

import { LEAD_ID_VARIABLE } from "@/lib/cartesia/client";
import { FINISHED_CALL_EVENTS, toCallResult, type CartesiaWebhookEvent } from "@/lib/cartesia/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { afterCallRecorded, recordCallResult } from "@/lib/voice/call-result";

/** Cartesia sends the secret set on the webhook in x-webhook-secret. Without one set here, nothing is accepted. */
function secretMatches(received: string | null): boolean {
  const expected = process.env.CARTESIA_WEBHOOK_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Receives Cartesia's call events. A finished call is saved onto its attempt, then
 * billed, delivered and counted towards its campaign. Cartesia retries a 5xx, so a
 * failed save answers 500; a 401 or 400 is never retried.
 */
export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-webhook-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = (await request.json().catch(() => null)) as CartesiaWebhookEvent | null;
  if (!event?.type) return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  if (!FINISHED_CALL_EVENTS.has(event.type)) return NextResponse.json({ received: true });

  const callId = event.call?.id ?? event.call_id;
  if (!callId) return NextResponse.json({ error: "Missing call id" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  let { data: attempt } = await supabase
    .from("call_attempts")
    .select("id, lead_id")
    .eq("attempt_id", callId)
    .maybeSingle();

  // Fallback: the lead id we sent with the call, matched to that lead's call still in progress.
  const leadId = event.call?.dynamic_variables?.[LEAD_ID_VARIABLE];
  if (!attempt && typeof leadId === "string" && leadId) {
    ({ data: attempt } = await supabase
      .from("call_attempts")
      .select("id, lead_id")
      .eq("lead_id", leadId)
      .eq("status", "dispatched")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle());
  }

  // Calls started from Cartesia's own playground have no lead behind them.
  if (!attempt) return NextResponse.json({ received: true, matched: false });

  const result = toCallResult(event);
  let saved: boolean;
  try {
    saved = await recordCallResult(supabase, attempt, result);
  } catch (err) {
    console.error("[Cartesia webhook]", err, callId);
    return NextResponse.json({ error: "Could not save call result" }, { status: 500 });
  }

  // Answer first; slow or failing destinations must not delay or fail the webhook.
  if (saved) after(() => afterCallRecorded(supabase, attempt, result.status));

  return NextResponse.json({ received: true, call_id: callId });
}
