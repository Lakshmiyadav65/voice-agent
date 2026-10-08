import { NextResponse } from "next/server";

import { canManageBusiness, getAccessScope, primaryBusinessId } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { checkContacts, MAX_CONTACTS, type ContactInput } from "@/lib/campaigns/contacts";
import { createAdminClient } from "@/lib/supabase/admin";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const businessId = primaryBusinessId(await getAccessScope(supabase, session));
  if (!businessId || !(await canManageBusiness(supabase, session, businessId))) {
    return NextResponse.json({ error: "Only the business owner can create campaigns." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "Give the campaign a name." }, { status: 400 });

  const windowStart = TIME.test(body?.windowStart) ? body.windowStart : "10:00";
  const windowEnd = TIME.test(body?.windowEnd) ? body.windowEnd : "19:00";
  // TRAI telemarketing hours; the database enforces the same bounds.
  if (windowStart < "09:00" || windowEnd > "21:00" || windowEnd <= windowStart) {
    return NextResponse.json({ error: "Calling hours must be between 09:00 and 21:00, with the end after the start." }, { status: 400 });
  }

  const raw: ContactInput[] = Array.isArray(body?.contacts) ? body.contacts.slice(0, MAX_CONTACTS + 1) : [];
  if (raw.length > MAX_CONTACTS) {
    return NextResponse.json({ error: `Upload up to ${MAX_CONTACTS} contacts per campaign.` }, { status: 400 });
  }
  const { valid } = checkContacts(
    raw.map((c) => ({ name: String(c?.name ?? ""), phone: String(c?.phone ?? ""), notes: c?.notes ? String(c.notes) : undefined }))
  );
  if (!valid.length) return NextResponse.json({ error: "No valid phone numbers in the list." }, { status: 400 });

  const { data: blocked } = await supabase
    .from("do_not_call")
    .select("phone")
    .eq("business_id", businessId)
    .in("phone", valid.map((c) => c.phone));
  const blockedPhones = new Set((blocked ?? []).map((row) => row.phone));

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      business_id: businessId,
      name,
      window_start: windowStart,
      window_end: windowEnd,
      max_concurrent: intIn(body?.maxConcurrent, 1, 20, 3),
      max_attempts: intIn(body?.maxAttempts, 1, 5, 2),
      retry_after_minutes: intIn(body?.retryAfterMinutes, 15, 1440, 120),
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error || !campaign) return NextResponse.json({ error: "Could not create the campaign." }, { status: 500 });

  // Rows from one insert would all share now(), leaving the calling order (next_attempt_at)
  // and the listed order (created_at) to chance; a millisecond apart keeps the owner's order.
  const start = Date.now();
  const rows = valid.map((c, i) => {
    const at = new Date(start + i).toISOString();
    return {
      campaign_id: campaign.id,
      business_id: businessId,
      name: c.name,
      phone: c.phone,
      notes: c.notes ?? null,
      status: blockedPhones.has(c.phone) ? ("do_not_call" as const) : ("queued" as const),
      created_at: at,
      next_attempt_at: at,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insertError } = await supabase.from("campaign_contacts").insert(rows.slice(i, i + 500));
    if (insertError) {
      await supabase.from("campaigns").delete().eq("id", campaign.id);
      return NextResponse.json({ error: "Could not save the contacts." }, { status: 500 });
    }
  }

  return NextResponse.json(
    { id: campaign.id, contacts: rows.length, doNotCall: blockedPhones.size },
    { status: 201 }
  );
}
