import { timingSafeEqual } from "crypto";

import { after, NextResponse } from "next/server";

import { dograhAttemptId } from "@/lib/dograh/client";
import { syncDograhAttempt } from "@/lib/dograh/results";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dograh's Webhook node posts here when a call ends, with the payload
 * {"workflow_run_id": "{{workflow_run_id}}", "workflow_id": "{{workflow_id}}"}.
 * The body is only a pointer: the result itself is fetched from Dograh with our
 * API key, so a forged post can at most make us re-read a real run.
 */
function secretMatches(received: string | null): boolean {
  const expected = process.env.DOGRAH_WEBHOOK_SECRET;
  if (!expected) return true;
  if (!received) return false;

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-webhook-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const runId = Number(body?.workflow_run_id);
  const workflowId = Number(body?.workflow_id);
  if (!Number.isInteger(runId) || !Number.isInteger(workflowId)) {
    return NextResponse.json({ error: "workflow_run_id and workflow_id are required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: attempt } = await supabase
    .from("call_attempts")
    .select("id, lead_id, attempt_id, created_at")
    .eq("attempt_id", dograhAttemptId(workflowId, runId))
    .maybeSingle();

  if (!attempt) {
    // Test calls from the Dograh editor have no lead behind them.
    return NextResponse.json({ received: true, matched: false });
  }

  try {
    const result = await syncDograhAttempt(supabase, attempt, { waitForTranscript: false });
    if (result.state === "error") {
      console.error("[Dograh Webhook] Could not fetch run", attempt.attempt_id, result.error);
      // A server error makes Dograh retry the delivery.
      return NextResponse.json({ error: "Could not fetch the run from Dograh" }, { status: 502 });
    }
    if (result.state === "in_progress") {
      return NextResponse.json({ error: "Run has not finished yet" }, { status: 503 });
    }
    // Answer Dograh first; slow or failing destinations must not delay or fail its webhook.
    if (result.state === "recorded") after(result.followUp);
    return NextResponse.json({ received: true, state: result.state });
  } catch (err) {
    console.error("[Dograh Webhook]", err);
    return NextResponse.json({ error: "Could not save call result" }, { status: 500 });
  }
}
