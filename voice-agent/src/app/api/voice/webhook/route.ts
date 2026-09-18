import { NextResponse } from "next/server";
import { SarvamWebhookPayload } from "@/lib/sarvam/types";

export async function POST(request: Request) {
  try {
    const payload: SarvamWebhookPayload = await request.json();

    console.log("[Sarvam Voice Webhook] Received call completion event:", {
      attempt_id: payload.attempt_id,
      status: payload.status,
      duration: payload.duration,
      interaction_id: payload.interaction_id,
      failure_reason: payload.failure_reason,
      lead_id: payload.webhook_config?.metadata?.lead_id,
    });

    if (payload.interaction_transcript && payload.interaction_transcript.length > 0) {
      console.log(
        "[Sarvam Voice Webhook] Transcript summary turns:",
        payload.interaction_transcript.length
      );
    }

    if (payload.final_agent_variables) {
      console.log(
        "[Sarvam Voice Webhook] Final extracted agent variables:",
        payload.final_agent_variables
      );
    }

    // Return 200 OK so Sarvam marks the webhook delivery successful
    return NextResponse.json({ received: true, attempt_id: payload.attempt_id });
  } catch (err: any) {
    console.error("[Sarvam Voice Webhook] Error parsing webhook:", err);
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
}
