import { NextResponse } from "next/server";

import { loadAccessibleEmployee } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchLeadCall } from "@/lib/voice/dispatch-lead-call";
import { resolveWebhookUrl } from "@/lib/voice/webhook-url";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    // Calls go out under the employee's business name, so the caller must own it.
    const employee = body.aiEmployeeId
      ? await loadAccessibleEmployee(supabase, session, body.aiEmployeeId)
      : null;
    if (!employee) {
      return NextResponse.json({ error: "AI Employee not found" }, { status: 404 });
    }

    // The webhook writes the call outcome onto this lead, so it must share the employee's business.
    if (body.leadId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("business_id")
        .eq("id", body.leadId)
        .maybeSingle();
      if (lead?.business_id !== employee.business_id) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
    }

    const result = await dispatchLeadCall({
      aiEmployeeId: body.aiEmployeeId,
      customerName: body.customerName,
      phoneNumber: body.phoneNumber,
      reason: body.reason,
      initialBotMessage: body.initialBotMessage,
      initialStateName: body.initialStateName,
      leadId: body.leadId,
      agentVariables: body.agentVariables,
      webhookUrl: resolveWebhookUrl(request),
      triggeredBy: session.userId,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      attemptId: result.attemptId,
      message: `Call dispatched to ${body.phoneNumber} for ${result.businessName}`,
      variablesSent: {
        business_name: result.businessName,
        lead_name: body.customerName || "Valued Customer",
        initialBotMessage: result.openingMessage,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to trigger voice call" },
      { status: 500 }
    );
  }
}
