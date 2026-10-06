/**
 * Re-reads saved Cartesia calls from Cartesia and saves them again with the current mapping
 * and analysis: status, transcript with timestamps and its readable versions, call details,
 * summary and lead verdict. Billing is left alone, so nothing is charged twice.
 *
 *   npm run calls:resync            (calls saved without details or transcript versions)
 *   npm run calls:resync -- --all   (every Cartesia call)
 */
import { createClient } from "@supabase/supabase-js";

import { cartesiaHeaders } from "../src/lib/cartesia/client";
import { toCallResult, type CartesiaCall } from "../src/lib/cartesia/webhook";
import type { Database } from "../src/lib/database.types";
import { sanitizeCaptureFields } from "../src/lib/voice/capture-fields";
import { analyzeCall } from "../src/lib/voice/summarize-call";
import { addTranscriptVersions, hasTranscriptVersions } from "../src/lib/voice/translate-transcript";

const LEAD_STATUS = { connected: "contacted", no_answer: "unreachable", busy: "unreachable", failed: "unreachable" } as const;

async function main() {
  const all = process.argv.includes("--all");
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: attempts, error } = await supabase
    .from("call_attempts")
    .select("id, lead_id, attempt_id, call_details, transcript")
    .like("attempt_id", "ac_%")
    .neq("status", "dispatched");
  if (error) throw error;
  const todo = (attempts ?? []).filter((a) => all || !a.call_details || !hasTranscriptVersions(a.transcript));
  console.log(`${todo.length} call(s) to resync`);

  for (const attempt of todo) {
    const res = await fetch(`https://api.cartesia.ai/agents/calls/${attempt.attempt_id}`, { headers: cartesiaHeaders() });
    if (!res.ok) {
      console.warn(`  ${attempt.attempt_id}: Cartesia answered ${res.status}, skipped`);
      continue;
    }
    const call = (await res.json()) as CartesiaCall;
    const result = toCallResult({ type: call.status === "failed" ? "call_failed" : "call_completed", call });

    const { data: lead } = await supabase.from("leads").select("ai_employees(capture_fields)").eq("id", attempt.lead_id).maybeSingle();
    const fields = sanitizeCaptureFields(
      (lead as { ai_employees: { capture_fields: unknown } | null } | null)?.ai_employees?.capture_fields
    );
    const [analysis, transcript] = await Promise.all([
      analyzeCall(result.transcript, result.finalVariables, fields),
      addTranscriptVersions(result.transcript),
    ]);

    const { error: saveError } = await supabase
      .from("call_attempts")
      .update({
        status: result.status,
        duration: result.duration,
        failure_reason: result.failureReason,
        transcript,
        final_variables: result.finalVariables,
        summary: analysis.summary,
        visit_requested: analysis.visitRequested,
        preferred_visit_at: analysis.preferredVisitAt,
        outcome: analysis.outcome,
        sentiment: analysis.sentiment,
        unanswered_questions: analysis.unansweredQuestions,
        topics: analysis.topics,
        captured: analysis.captured,
        call_details: result.details ?? null,
      })
      .eq("id", attempt.id);
    if (saveError) {
      console.warn(`  ${attempt.attempt_id}: ${saveError.message}`);
      continue;
    }
    await supabase.from("leads").update({ status: LEAD_STATUS[result.status] }).eq("id", attempt.lead_id);
    console.log(`  ${attempt.attempt_id}: ${result.status}, ${analysis.summary.split(":")[0]}`);
  }
}

main().catch((err) => {
  console.error("Resync failed:", err.message ?? err);
  process.exit(1);
});
