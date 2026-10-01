import { NextResponse } from "next/server";

import { isPlatformStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Rupee amounts in, paise stored. Caps catch a mistyped extra zero.
const MAX_TOPUP_RUPEES = 500_000;
const MAX_RATE_RUPEES = 100;

async function staffOnly() {
  const session = await getSessionContext();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isPlatformStaff(session.profile.platform_role)) {
    return { error: NextResponse.json({ error: "Only platform staff can change credits." }, { status: 403 }) };
  }
  const supabase = createAdminClient();
  if (!supabase) return { error: NextResponse.json({ error: "Service unavailable" }, { status: 503 }) };
  return { session, supabase };
}

/** Adds (or, as an adjustment, removes) credit until a payment gateway does this automatically. */
export async function POST(request: Request) {
  const auth = await staffOnly();
  if ("error" in auth) return auth.error;
  const { session, supabase } = auth;

  const body = await request.json().catch(() => null);
  const amount = Number(body?.amountRupees);
  const kind = body?.kind === "adjustment" ? "adjustment" : "topup";

  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_TOPUP_RUPEES) {
    return NextResponse.json({ error: `Enter an amount up to ₹${MAX_TOPUP_RUPEES.toLocaleString("en-IN")}.` }, { status: 400 });
  }
  if (kind === "topup" && amount < 0) {
    return NextResponse.json({ error: "Use an adjustment to remove credit." }, { status: 400 });
  }

  const { data: business } = await supabase.from("businesses").select("id").eq("id", String(body?.businessId ?? "")).maybeSingle();
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const { error } = await supabase.from("credit_ledger").insert({
    business_id: business.id,
    kind,
    amount_paise: Math.round(amount * 100),
    note: typeof body?.note === "string" ? body.note.trim().slice(0, 200) || null : null,
    created_by: session.userId,
  });
  if (error) return NextResponse.json({ error: "Could not record the credit." }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await staffOnly();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = await request.json().catch(() => null);
  const rate = Number(body?.ratePerMinuteRupees);
  if (!Number.isFinite(rate) || rate < 0 || rate > MAX_RATE_RUPEES) {
    return NextResponse.json({ error: `Rate must be between ₹0 and ₹${MAX_RATE_RUPEES} per minute.` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("businesses")
    .update({ rate_per_minute_paise: Math.round(rate * 100) })
    .eq("id", String(body?.businessId ?? ""))
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
