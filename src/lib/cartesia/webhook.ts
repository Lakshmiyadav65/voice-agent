import { timingSafeEqual } from "crypto";

import type { CallTranscriptTurn } from "@/lib/database.types";
import type { CallResult } from "@/lib/voice/call-result";

/**
 * Whether a request from Cartesia carries our secret: the webhook sends it in
 * x-webhook-secret, and the knowledge tool is set up to send the same header.
 * With no secret configured, nothing is accepted.
 */
export function hasCartesiaSecret(request: Request): boolean {
  const expected = process.env.CARTESIA_WEBHOOK_SECRET;
  const received = request.headers.get("x-webhook-secret");
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The parts of Cartesia's call event we use (see docs.cartesia.ai observability#webhooks). */
export type CartesiaCall = {
  id?: string;
  agent_id?: string;
  status?: "started" | "completed" | "failed";
  start_time?: string;
  end_time?: string;
  end_reason?: string;
  transcript?: { role?: "assistant" | "user"; text?: string }[];
  error_message?: string;
  dynamic_variables?: Record<string, unknown>;
  /** "from" is the caller's number on inbound calls, or "websocket" for a browser preview. */
  telephony_params?: { from?: string; to?: string; direction?: string };
};

export type CartesiaWebhookEvent = {
  type?: string;
  call_id?: string;
  agent_id?: string;
  end_reason?: string;
  call?: CartesiaCall;
};

/** The events that carry a finished call. call_started, call_turn and post_call_analysis are ignored. */
export const FINISHED_CALL_EVENTS = new Set(["call_completed", "call_failed"]);

// End reasons where nobody was reached. Every other reason on a completed call means it connected.
const NOT_REACHED: Record<string, CallResult["status"]> = {
  dial_no_answer: "no_answer",
  dial_timeout: "no_answer",
  voicemail_detected: "no_answer",
  dial_busy: "busy",
  dial_failed: "failed",
};

/** A finished Cartesia call in our own terms, for recordCallResult. */
export function toCallResult(event: CartesiaWebhookEvent): CallResult {
  const call = event.call ?? {};
  const endReason = call.end_reason ?? event.end_reason ?? "";
  const failed = event.type === "call_failed" || call.status === "failed";
  const status = NOT_REACHED[endReason] ?? (failed ? "failed" : "connected");

  const transcript: CallTranscriptTurn[] = (call.transcript ?? [])
    .filter((turn) => turn.text?.trim())
    .map((turn) => ({ role: turn.role === "assistant" ? "agent" : "user", en_text: turn.text!.trim() }));

  const start = Date.parse(call.start_time ?? "");
  const end = Date.parse(call.end_time ?? "");
  // Only a connected call is billed, so only its length is kept.
  const duration = status === "connected" && start && end ? Math.max(0, Math.round((end - start) / 1000)) : null;

  return {
    status,
    duration,
    failureReason: status === "connected" ? null : call.error_message || endReason || null,
    interactionId: call.id ?? event.call_id ?? null,
    transcript: transcript.length ? transcript : null,
    finalVariables: call.dynamic_variables ?? null,
  };
}
