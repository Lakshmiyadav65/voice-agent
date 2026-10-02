import { timingSafeEqual } from "crypto";

import { after, NextResponse } from "next/server";

import { runCampaignTick } from "@/lib/campaigns/engine";
import { syncPendingDograhCalls } from "@/lib/dograh/results";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWebhookUrl } from "@/lib/voice/webhook-url";

// Each tick dials real phones, so only the scheduler may trigger it. Vercel Cron
// sends "Authorization: Bearer $CRON_SECRET" automatically when the env var is set.
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV === "development";

  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const results = await runCampaignTick(supabase, { webhookUrl: resolveWebhookUrl(request) });

  // Same per-minute schedule picks up any Dograh call whose result webhook went missing.
  const followUps = await syncPendingDograhCalls(supabase, { limit: 10 });
  followUps.forEach((followUp) => after(followUp));

  return NextResponse.json({ ran: results.length, results, resultsPulled: followUps.length });
}
