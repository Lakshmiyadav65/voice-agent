import type { SupabaseClient } from "@supabase/supabase-js";

import type { Business, CallAttempt, Database, DeliveryTarget, Lead } from "@/lib/database.types";
import { sendToTarget, type SendResult } from "@/lib/delivery/channels";
import { buildCallResultPayload, buildTestPayload } from "@/lib/delivery/payload";

type AdminClient = SupabaseClient<Database>;

async function recordTargetResult(supabase: AdminClient, targetId: string, result: SendResult) {
  await supabase
    .from("delivery_targets")
    .update({
      last_status: result.ok ? "sent" : "failed",
      last_error: result.ok ? null : result.error,
      last_sent_at: new Date().toISOString(),
    })
    .eq("id", targetId);
}

/**
 * Sends a finished call to every enabled destination of its business. Each
 * target is independent: one failing endpoint never stops the others.
 */
export async function deliverCallResult(supabase: AdminClient, callAttemptId: string) {
  const { data: attempt } = await supabase
    .from("call_attempts")
    .select("*")
    .eq("id", callAttemptId)
    .maybeSingle<CallAttempt>();
  if (!attempt) return;

  const [{ data: lead }, { data: business }, { data: targets }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", attempt.lead_id).maybeSingle<Lead>(),
    supabase.from("businesses").select("id, name").eq("id", attempt.business_id).maybeSingle<Pick<Business, "id" | "name">>(),
    supabase
      .from("delivery_targets")
      .select("*")
      .eq("business_id", attempt.business_id)
      .eq("enabled", true),
  ]);
  if (!lead || !business || !targets?.length) return;

  const payload = buildCallResultPayload(business, lead, attempt);

  await Promise.all(
    (targets as DeliveryTarget[]).map(async (target) => {
      // Claim first: a duplicate webhook from Sarvam hits the unique key and sends nothing.
      const { data: claim } = await supabase
        .from("deliveries")
        .insert({ target_id: target.id, business_id: business.id, call_attempt_id: attempt.id })
        .select("id")
        .maybeSingle();
      if (!claim) return;

      const result = await sendToTarget(target, payload);

      await supabase
        .from("deliveries")
        .update({
          status: result.ok ? "sent" : "failed",
          response_code: result.code ?? null,
          error: result.ok ? null : result.error,
        })
        .eq("id", claim.id);
      await recordTargetResult(supabase, target.id, result);
    })
  );
}

/** Sends the sample payload so owners can check a destination before a real lead arrives. */
export async function sendTestDelivery(
  supabase: AdminClient,
  target: DeliveryTarget,
  business: Pick<Business, "id" | "name">
): Promise<SendResult> {
  const result = await sendToTarget(target, buildTestPayload(business));
  await recordTargetResult(supabase, target.id, result);
  return result;
}
