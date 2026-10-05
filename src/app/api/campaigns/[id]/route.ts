import { after, NextResponse } from "next/server";

import { getSessionContext } from "@/lib/auth/session";
import { loadManageableCampaign } from "@/lib/campaigns/access";
import { runCampaignTick } from "@/lib/campaigns/engine";
import type { Campaign } from "@/lib/database.types";

type RouteContext = { params: Promise<{ id: string }> };

const TRANSITIONS: Record<string, { from: Campaign["status"][]; to: Campaign["status"] }> = {
  start: { from: ["draft"], to: "running" },
  pause: { from: ["running"], to: "paused" },
  resume: { from: ["paused"], to: "running" },
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase, campaign } = await loadManageableCampaign(session, (await params).id);
  if (!supabase || !campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const transition = TRANSITIONS[body?.action as string];
  if (!transition) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (!transition.from.includes(campaign.status)) {
    return NextResponse.json({ error: `A ${campaign.status} campaign cannot ${body.action}.` }, { status: 409 });
  }

  const { data: updated } = await supabase
    .from("campaigns")
    .update({
      status: transition.to,
      ...(body.action === "start" ? { started_at: new Date().toISOString() } : {}),
    })
    .eq("id", campaign.id)
    .eq("status", campaign.status)
    .select("*")
    .single();

  if (transition.to === "running") {
    // Dial the first batch now instead of waiting up to a minute for the scheduler.
    after(() => runCampaignTick(supabase, { campaignId: campaign.id }).then(() => undefined));
  }

  return NextResponse.json({ campaign: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase, campaign } = await loadManageableCampaign(session, (await params).id);
  if (!supabase || !campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status === "running") {
    return NextResponse.json({ error: "Pause the campaign before deleting it." }, { status: 409 });
  }

  // Leads and call history stay: they are the business's records, not the campaign's.
  await supabase.from("campaigns").delete().eq("id", campaign.id);
  return NextResponse.json({ deleted: true });
}
