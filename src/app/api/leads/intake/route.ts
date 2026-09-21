import { NextResponse } from "next/server";

import { formatE164PhoneNumber } from "@/lib/sarvam/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkSubmissionAllowed, clientIpFrom, hashIp } from "@/lib/leads/rate-limit";
import { dispatchLeadCall } from "@/lib/voice/dispatch-lead-call";
import { resolveWebhookUrl } from "@/lib/voice/webhook-url";

const MAX_FIELD_LENGTH = 500;

// Client sites post from their own domains, so the browser preflights first.
// Safe to allow any origin: the endpoint takes no cookies and reads no session.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_FIELD_LENGTH);
  return trimmed || undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return json({ error: "Invalid request body." }, 400);
    }

    // Bots fill every field they find; real browsers leave the hidden one empty.
    // Answer 202 anyway so they get no signal that the submission was dropped.
    if (clean(body.company_website)) {
      return json({ accepted: true }, 202);
    }

    const businessId = clean(body.businessId);
    const name = clean(body.name);
    const rawPhone = clean(body.phone);

    if (!businessId || !name || !rawPhone) {
      return json({ error: "businessId, name and phone are required." }, 400);
    }

    const phone = formatE164PhoneNumber(rawPhone);
    if (!/^\+\d{8,15}$/.test(phone)) {
      return json({ error: "Enter a valid phone number." }, 400);
    }

    const ipHash = hashIp(clientIpFrom(request));

    const verdict = await checkSubmissionAllowed(phone, ipHash);
    if (!verdict.allowed) {
      return json({ error: verdict.reason }, 429);
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return json({ error: "Service unavailable." }, 503);
    }

    const { data: business } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .maybeSingle();

    if (!business) {
      return json({ error: "Unknown business." }, 404);
    }

    const aiEmployeeId = clean(body.aiEmployeeId);
    const enquiry = clean(body.enquiry);

    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        business_id: businessId,
        ai_employee_id: aiEmployeeId ?? null,
        name,
        phone,
        email: clean(body.email) ?? null,
        enquiry: enquiry ?? null,
        source: clean(body.source) ?? "ad_form",
        utm: typeof body.utm === "object" && body.utm ? body.utm : {},
        ip_hash: ipHash,
        status: "new",
      })
      .select("id")
      .single();

    if (insertError || !lead) {
      return json({ error: "Could not record your request." }, 500);
    }

    const result = await dispatchLeadCall({
      aiEmployeeId: aiEmployeeId ?? null,
      customerName: name,
      phoneNumber: phone,
      reason: enquiry,
      leadId: lead.id,
      webhookUrl: resolveWebhookUrl(request),
    });

    if (!result.success) {
      // The lead is already saved, so the business can still follow up by hand.
      await supabase.from("leads").update({ status: "unreachable" }).eq("id", lead.id);
      return json({ accepted: true, called: false, leadId: lead.id }, 202);
    }

    await supabase
      .from("call_attempts")
      .insert({
        lead_id: lead.id,
        business_id: businessId,
        attempt_id: result.attemptId!,
        status: "dispatched",
      });

    await supabase.from("leads").update({ status: "calling" }).eq("id", lead.id);

    return json({ accepted: true, called: true, leadId: lead.id }, 202);
  } catch {
    return json({ error: "Could not process your request." }, 500);
  }
}
