import { after, NextResponse } from "next/server";

import { loadManagedAgent } from "@/lib/agents/load-agent";
import { readBrowserCallCode } from "@/lib/dograh/browser-call";
import { dograhAttemptId, dograhWorkflowFor, getDograhRun } from "@/lib/dograh/client";
import { syncDograhAttempt } from "@/lib/dograh/results";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Records a browser test call once it connects, as a lead with one call attempt,
 * so its transcript and analysis land with every other call. The run must carry
 * the caller's own code, so nobody can claim another session's run.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const loaded = await loadManagedAgent((await params).id);
  if (loaded instanceof NextResponse) return loaded;
  const { supabase, session, employee } = loaded;

  const body = await request.json().catch(() => null);
  const code = readBrowserCallCode(body?.code);
  const runId = Number(body?.workflowRunId);
  const workflowId = dograhWorkflowFor(employee.dograh_workflow_id);
  if (!code || code.aiEmployeeId !== employee.id || code.userId !== session.userId || !Number.isInteger(runId)) {
    return NextResponse.json({ error: "This call session has expired. Start a new call." }, { status: 400 });
  }
  if (!workflowId) return NextResponse.json({ error: "This agent is not linked to a Dograh agent" }, { status: 409 });

  const run = await getDograhRun(workflowId, runId);
  if (!run.ok || run.data.initial_context?.caller_number !== body.code) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const attemptId = dograhAttemptId(run.data.workflow_id, runId);
  const { data: existing } = await supabase.from("call_attempts").select("id").eq("attempt_id", attemptId).maybeSingle();
  if (existing) return NextResponse.json({ attemptId: existing.id });

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      business_id: employee.business_id,
      ai_employee_id: employee.id,
      name: "Browser test call",
      phone: "Browser",
      enquiry: "Trying the agent from the dashboard",
      source: "browser_test",
      status: "calling",
    })
    .select("id")
    .single();
  if (leadError || !lead) return NextResponse.json({ error: "Could not record the call" }, { status: 500 });

  const { data: attempt } = await supabase
    .from("call_attempts")
    .insert({ lead_id: lead.id, business_id: employee.business_id, attempt_id: attemptId, status: "dispatched" })
    .select("id")
    .single();
  if (!attempt) {
    // A second report of the same call won the insert; keep its lead, not this one.
    await supabase.from("leads").delete().eq("id", lead.id);
    const { data: winner } = await supabase.from("call_attempts").select("id").eq("attempt_id", attemptId).maybeSingle();
    return winner
      ? NextResponse.json({ attemptId: winner.id })
      : NextResponse.json({ error: "Could not record the call" }, { status: 500 });
  }

  return NextResponse.json({ attemptId: attempt.id });
}

/** The test call's result, pulled from Dograh if it has not arrived yet. */
export async function GET(request: Request, { params }: RouteContext) {
  const loaded = await loadManagedAgent((await params).id);
  if (loaded instanceof NextResponse) return loaded;
  const { supabase, employee } = loaded;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const columns = "id, lead_id, attempt_id, created_at, status, summary, outcome, duration, failure_reason";
  const read = () =>
    supabase.from("call_attempts").select(columns).eq("id", id).eq("business_id", employee.business_id).maybeSingle();

  let { data: attempt } = await read();
  if (!attempt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (attempt.status === "dispatched") {
    const synced = await syncDograhAttempt(supabase, attempt, { waitForTranscript: true }).catch(() => null);
    if (synced?.state === "recorded") after(synced.followUp);
    if (synced?.state === "recorded" || synced?.state === "already_recorded") ({ data: attempt } = await read());
  }

  return NextResponse.json({
    status: attempt?.status,
    summary: attempt?.summary,
    outcome: attempt?.outcome,
    duration: attempt?.duration,
    failureReason: attempt?.failure_reason,
  });
}
