import { getBalancePaise } from "@/lib/billing/credits";
import type { CreditLedgerEntry } from "@/lib/database.types";
import { istDay } from "@/lib/data/leads";
import { createAdminClient } from "@/lib/supabase/admin";

export type UsageDay = { day: string; calls: number; minutes: number; spendPaise: number };

export type Usage = {
  balancePaise: number;
  ratePaise: number;
  month: { calls: number; minutes: number; spendPaise: number };
  days: UsageDay[];
  ledger: CreditLedgerEntry[];
};

const DAYS = 30;

/** Everything the owner's Usage page shows, from billed calls and the ledger. */
export async function getUsage(businessId: string): Promise<Usage | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const monthPrefix = istDay(Date.now()).slice(0, 7);
  // Reach back to the 1st even on the 31st, or "This month" would drop day one.
  const since = new Date(
    Math.min(Date.now() - DAYS * 86_400_000, Date.parse(`${monthPrefix}-01T00:00:00+05:30`))
  ).toISOString();
  const [balancePaise, { data: business }, { data: calls }, { data: ledger }] = await Promise.all([
    getBalancePaise(supabase, businessId),
    supabase.from("businesses").select("rate_per_minute_paise").eq("id", businessId).maybeSingle(),
    supabase
      .from("call_attempts")
      .select("created_at, billed_minutes, charge_paise")
      .eq("business_id", businessId)
      .gte("created_at", since)
      .gt("billed_minutes", 0)
      .limit(10000),
    supabase
      .from("credit_ledger")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const days = new Map<string, UsageDay>();
  for (let i = DAYS - 1; i >= 0; i--) {
    const day = istDay(Date.now() - i * 86_400_000);
    days.set(day, { day, calls: 0, minutes: 0, spendPaise: 0 });
  }

  const month ={ calls: 0, minutes: 0, spendPaise: 0 };

  for (const call of calls ?? []) {
    const day = istDay(call.created_at);
    const row = days.get(day);
    const minutes = call.billed_minutes ?? 0;
    const spend = call.charge_paise ?? 0;
    if (row) {
      row.calls++;
      row.minutes += minutes;
      row.spendPaise += spend;
    }
    if (day.startsWith(monthPrefix)) {
      month.calls++;
      month.minutes += minutes;
      month.spendPaise += spend;
    }
  }

  return {
    balancePaise,
    ratePaise: business?.rate_per_minute_paise ?? 300,
    month,
    days: [...days.values()].reverse(),
    ledger: (ledger as CreditLedgerEntry[] | null) ?? [],
  };
}
