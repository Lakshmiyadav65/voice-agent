import type { SupabaseClient } from "@supabase/supabase-js";
import { after, NextResponse } from "next/server";

import { findAgentOwner } from "@/lib/cartesia/agents";
import { LEAD_ID_VARIABLE } from "@/lib/cartesia/client";
import {
  FINISHED_CALL_EVENTS,
  hasCartesiaSecret,
  toCallResult,
  type CartesiaWebhookEvent,
} from "@/lib/cartesia/webhook";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { afterCallRecorded, recordCallResult, type RecordableAttempt } from "@/lib/voice/call-result";

type AdminClient = SupabaseClient<Database>;

/**
 * Receives Cartesia's call events. A finished call is saved onto its attempt, then
 * billed, delivered and counted towards its campaign. Calls we placed are matched by
 * call id; any other call to a client's agent (an inbound call or a browser preview) is
 * saved as a new lead for that client. Cartesia retries a 5xx, so a failed save answers
 * 500; a 401 or 400 is never retried.
 */
export async function POST(request: Request) {
  if (!hasCartesiaSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const event = (await request.json().catch(() => null)) as CartesiaWebhookEvent | null;
  if (!event?.type) return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  if (!FINISHED_CALL_EVENTS.has(event.type)) return NextResponse.json({ received: true });

  const callId = event.call?.id ?? event.call_id;
  if (!callId) return NextResponse.json({ error: "Missing call id" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const attempt = (await findPlacedAttempt(supabase, callId, event)) ?? (await saveIncomingCall(supabase, callId, event));
  // An unlinked agent, such as the shared one previewed in the Playground, has no client to save under.
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
  if (saved) after(() => afterCallRecorded(supabase, attempt, result));

  return NextResponse.json({ received: true, call_id: callId });
}

/** The attempt for a call we placed: by call id, else by the lead id we sent with it. */
async function findPlacedAttempt(
  supabase: AdminClient,
  callId: string,
  event: CartesiaWebhookEvent
): Promise<RecordableAttempt | null> {
  const { data: byCall } = await supabase.from("call_attempts").select("id, lead_id").eq("attempt_id", callId).maybeSingle();
  if (byCall) return byCall;

  const leadId = event.call?.dynamic_variables?.[LEAD_ID_VARIABLE];
  if (typeof leadId !== "string" || !leadId) return null;
  const { data: byLead } = await supabase
    .from("call_attempts")
    .select("id, lead_id")
    .eq("lead_id", leadId)
    .eq("status", "dispatched")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return byLead;
}

/**
 * A call nobody on our side placed, to an agent linked to a client: saved as a lead with
 * one attempt so it shows in that client's Calls like any other. The attempt's unique
 * call id makes a redelivered event find this attempt instead of adding a second lead.
 */
async function saveIncomingCall(
  supabase: AdminClient,
  callId: string,
  event: CartesiaWebhookEvent
): Promise<RecordableAttempt | null> {
  const owner = await findAgentOwner(supabase, event.call?.agent_id ?? event.agent_id);
  if (!owner) return null;

  const from = event.call?.telephony_params?.from ?? "";
  const isPhone = /^\+?\d{6,15}$/.test(from);
  const { data: lead } = await supabase
    .from("leads")
    .insert({
      business_id: owner.businessId,
      ai_employee_id: owner.employeeId,
      name: isPhone ? "Inbound caller" : "Browser preview",
      phone: isPhone ? from : "Browser preview",
      source: isPhone ? "inbound_call" : "browser_test",
      status: "calling",
    })
    .select("id")
    .single();
  if (!lead) return null;

  const { data: attempt, error } = await supabase
    .from("call_attempts")
    .insert({ lead_id: lead.id, business_id: owner.businessId, attempt_id: callId, status: "dispatched" })
    .select("id, lead_id")
    .single();
  if (attempt) return attempt;

  // 23505: a concurrent delivery of the same event saved this call first.
  await supabase.from("leads").delete().eq("id", lead.id);
  if (error?.code !== "23505") return null;
  const { data: existing } = await supabase.from("call_attempts").select("id, lead_id").eq("attempt_id", callId).maybeSingle();
  return existing;
}
