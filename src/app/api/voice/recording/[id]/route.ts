import { NextResponse } from "next/server";

import { canAccessBusiness, getAccessScope } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { getDograhRun, parseDograhAttemptId } from "@/lib/dograh/client";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Plays a call's recording. The audio stays with Dograh behind a short-lived
 * signed link, so each play asks Dograh for a fresh one instead of storing it.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: attempt } = await supabase
    .from("call_attempts")
    .select("business_id, attempt_id")
    .eq("id", (await params).id)
    .maybeSingle();

  const scope = await getAccessScope(supabase, session);
  const ref = attempt && canAccessBusiness(scope, attempt.business_id) ? parseDograhAttemptId(attempt.attempt_id) : null;
  if (!ref) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const run = await getDograhRun(ref.workflowId, ref.runId);
  if (!run.ok || !run.data.recording_url || !run.data.recording_public_url) {
    return NextResponse.json({ error: "No recording for this call" }, { status: 404 });
  }

  return NextResponse.redirect(`${run.data.recording_public_url}?inline=true`);
}
