import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

type AdminClient = SupabaseClient<Database>;

/**
 * Charges are always recorded, but calls are only blocked for low balance once
 * BILLING_ENFORCED=true — so turning billing on is a deliberate switch, not a
 * side effect of deploying this code.
 */
export function isBillingEnforced(): boolean {
  return process.env.BILLING_ENFORCED?.trim().toLowerCase() === "true";
}

export function formatRupees(paise: number): string {
  // A balance can dip below zero when a call outlasts the remaining credit.
  const rupees = Math.abs(paise) / 100;
  const amount = rupees.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${paise < 0 ? "−" : ""}₹${amount}`;
}

export async function getBalancePaise(supabase: AdminClient, businessId: string): Promise<number> {
  const { data } = await supabase
    .from("business_balances")
    .select("balance_paise")
    .eq("business_id", businessId)
    .maybeSingle();
  return Number(data?.balance_paise ?? 0);
}

async function getRatePaise(supabase: AdminClient, businessId: string): Promise<number> {
  const { data } = await supabase
    .from("businesses")
    .select("rate_per_minute_paise")
    .eq("id", businessId)
    .maybeSingle();
  return data?.rate_per_minute_paise ?? 300;
}

export const OUT_OF_CREDITS = "Out of call credits. Top up to resume calling.";

/** At least one minute's worth must remain, so a call never starts on an empty wallet. */
export async function canPlaceCall(
  supabase: AdminClient,
  businessId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isBillingEnforced()) return { ok: true };

  const [balance, rate] = await Promise.all([
    getBalancePaise(supabase, businessId),
    getRatePaise(supabase, businessId),
  ]);
  return balance >= rate ? { ok: true } : { ok: false, error: OUT_OF_CREDITS };
}

/**
 * Bills a finished call: every started minute of a connected call, nothing for
 * ring time or unanswered calls. The unique call_attempt_id on the ledger makes
 * a redelivered webhook a no-op instead of a second charge.
 */
export async function chargeCall(supabase: AdminClient, callAttemptId: string) {
  const { data: attempt } = await supabase
    .from("call_attempts")
    .select("id, business_id, status, duration, charge_paise")
    .eq("id", callAttemptId)
    .maybeSingle();
  if (!attempt || attempt.charge_paise !== null) return;

  const seconds = attempt.status === "connected" ? Math.max(0, attempt.duration ?? 0) : 0;
  const minutes = Math.ceil(seconds / 60);
  const rate = minutes ? await getRatePaise(supabase, attempt.business_id) : 0;
  const charge = minutes * rate;

  if (charge > 0) {
    const { error } = await supabase.from("credit_ledger").insert({
      business_id: attempt.business_id,
      kind: "call_charge",
      amount_paise: -charge,
      call_attempt_id: attempt.id,
      note: `${minutes} min call`,
    });
    // 23505: this call was already charged by an earlier delivery of the webhook.
    if (error && error.code !== "23505") throw error;
  }

  await supabase
    .from("call_attempts")
    .update({ billed_minutes: minutes, charge_paise: charge })
    .eq("id", attempt.id);
}
