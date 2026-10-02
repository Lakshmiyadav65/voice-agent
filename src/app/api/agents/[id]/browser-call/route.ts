import { NextResponse } from "next/server";

import { loadManagedAgent } from "@/lib/agents/load-agent";
import { canPlaceCall } from "@/lib/billing/credits";
import { createBrowserCallCode } from "@/lib/dograh/browser-call";
import { getDograhWidgetUrl } from "@/lib/dograh/client";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Prepares one browser voice call with the saved agent: the Dograh widget to
 * load, and the signed code the widget passes as the caller number so Dograh
 * can fetch this agent's brief when the call starts.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const loaded = await loadManagedAgent((await params).id);
  if (loaded instanceof NextResponse) return loaded;
  const { supabase, session, employee } = loaded;

  const credit = await canPlaceCall(supabase, employee.business_id);
  if (!credit.ok) return NextResponse.json({ error: credit.error }, { status: 402 });

  const widget = await getDograhWidgetUrl(employee.dograh_workflow_id);
  if (!widget.ok) return NextResponse.json({ error: widget.error }, { status: 409 });

  const code = createBrowserCallCode({ aiEmployeeId: employee.id, userId: session.userId });
  if (!code) return NextResponse.json({ error: "DOGRAH_API_KEY is not configured" }, { status: 409 });

  return NextResponse.json({ code, widgetUrl: widget.data });
}
