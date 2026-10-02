import { NextResponse } from "next/server";

import { toDograhContext } from "@/lib/dograh/agent-settings";
import { readBrowserCallCode } from "@/lib/dograh/browser-call";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildCallBrief,
  prepareCallBrief,
  resolveEmployeeContext,
  type CallBrief,
} from "@/lib/voice/dispatch-lead-call";

// Dograh waits 10 seconds before starting the call without us; the greeting
// translation alone may take 8, so past this budget the untranslated brief goes.
const BRIEF_BUDGET_MS = 5000;

/**
 * Dograh's pre-call data fetch, set on the agent's Start node for inbound calls.
 * Browser test calls arrive with a signed code as their caller number, and get
 * the agent's full brief back as initial_context. Real inbound phone calls get
 * nothing extra yet; matching them to a business by the number dialled is where
 * the inbound line will plug in.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const code = readBrowserCallCode(body?.call_inbound?.from_number);
  if (!code) return NextResponse.json({});

  // The person testing plays the lead, so the agent greets them by name.
  const supabase = createAdminClient();
  const profile = supabase
    ? (await supabase.from("profiles").select("full_name").eq("id", code.userId).maybeSingle()).data
    : null;
  // No enquiry: the standard one keeps the call realistic, where a note about testing got read out.
  const caller = { name: profile?.full_name?.trim() || "Test Caller", phone: "Browser" };

  const context = await resolveEmployeeContext(code.aiEmployeeId);
  const brief = await Promise.race([
    prepareCallBrief(context, caller),
    new Promise<CallBrief>((resolve) =>
      setTimeout(() => resolve(buildCallBrief(context, caller)), BRIEF_BUDGET_MS)
    ),
  ]);

  return NextResponse.json({ initial_context: toDograhContext(brief, context.settings, {}) });
}
