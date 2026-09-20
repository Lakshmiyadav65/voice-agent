import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/auth/session";
import { dispatchLeadCall } from "@/lib/voice/dispatch-lead-call";
import { resolveWebhookUrl } from "@/lib/voice/webhook-url";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

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
