import type { SupabaseClient } from "@supabase/supabase-js";

import type { CallAttempt, CallTranscriptTurn, Database } from "@/lib/database.types";
import { afterCallRecorded, recordCallResult, type CallResult } from "@/lib/voice/call-result";

import {
  DOGRAH_ATTEMPT_PATTERN,
  downloadDograhTranscript,
  getDograhRun,
  parseDograhAttemptId,
  type DograhRun,
} from "./client";

type AdminClient = SupabaseClient<Database>;

type SyncableAttempt = Pick<CallAttempt, "id" | "lead_id" | "attempt_id" | "created_at">;

export type SyncResult =
  | { state: "recorded"; followUp: () => Promise<void> }
  | { state: "already_recorded" | "in_progress" | "not_dograh" }
  | { state: "error"; error: string };

// Dograh's telephony statuses for calls that never connected; any other status reached a conversation.
const NOT_CONNECTED: Record<string, CallResult["status"]> = {
  "no-answer": "no_answer",
  busy: "busy",
  failed: "failed",
  canceled: "failed",
  error: "failed",
};

// Dograh marks a run complete a moment before it uploads the transcript.
const TRANSCRIPT_GRACE_MS = 10 * 60_000;
// Calls still unresolved after a day are not worth asking Dograh about on every pass.
const PENDING_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Dograh writes one "[time] user: text" or "[time] assistant: text" line per
 * turn, in the language actually spoken. That text goes into en_text, which
 * holds Sarvam's English rendering for Sarvam calls.
 */
export function parseDograhTranscript(text: string): CallTranscriptTurn[] {
  const turns: CallTranscriptTurn[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^(?:\[[^\]]*\]\s*)?(user|assistant):\s?(.*)$/.exec(line);
    if (match) {
      turns.push({ role: match[1] === "user" ? "user" : "agent", en_text: match[2].trim() });
    } else if (line.trim() && turns.length) {
      // A turn whose own text runs over several lines.
      turns[turns.length - 1].en_text += `\n${line.trim()}`;
    }
  }
  return turns.filter((turn) => turn.en_text);
}

function callStatusOf(run: DograhRun): string {
  const status = run.gathered_context?.call_status;
  return typeof status === "string" ? status : "";
}

async function toCallResult(run: DograhRun): Promise<CallResult> {
  const gathered = run.gathered_context ?? {};
  const callStatus = callStatusOf(run);
  const status = NOT_CONNECTED[callStatus] ?? "connected";

  // The public link exists whenever any artifact does, so check the transcript itself was stored.
  const text =
    run.transcript_url && run.transcript_public_url
      ? await downloadDograhTranscript(run.transcript_public_url)
      : null;
  const transcript = text ? parseDograhTranscript(text) : [];
  const seconds = run.usage_info?.call_duration_seconds ?? run.cost_info?.call_duration_seconds;

  return {
    status,
    duration: typeof seconds === "number" ? Math.round(seconds) : null,
    failureReason: status === "connected" ? null : String(gathered.error || callStatus),
    interactionId: run.name,
    transcript: transcript.length ? transcript : null,
    finalVariables: gathered,
  };
}

/**
 * Fetches one run from Dograh and saves it once the call has finished. Results
 * arrive both by Dograh's webhook and by this pull, so a webhook that never
 * reaches us (a restarted tunnel, a deploy) does not lose the call. Throws when
 * the save fails.
 */
export async function syncDograhAttempt(
  supabase: AdminClient,
  attempt: SyncableAttempt,
  options: { waitForTranscript: boolean }
): Promise<SyncResult> {
  const ref = parseDograhAttemptId(attempt.attempt_id);
  if (!ref) return { state: "not_dograh" };

  const run = await getDograhRun(ref.workflowId, ref.runId);
  if (!run.ok) return { state: "error", error: run.error };
  if (!run.data.is_completed) return { state: "in_progress" };

  const connected = !NOT_CONNECTED[callStatusOf(run.data)];
  const age = Date.now() - new Date(attempt.created_at).getTime();
  if (options.waitForTranscript && connected && !run.data.transcript_url && age < TRANSCRIPT_GRACE_MS) {
    return { state: "in_progress" };
  }

  const result = await toCallResult(run.data);
  const saved = await recordCallResult(supabase, attempt, result);
  if (!saved) return { state: "already_recorded" };
  return { state: "recorded", followUp: () => afterCallRecorded(supabase, attempt, result.status) };
}

/**
 * Pulls the newest Dograh calls still waiting on a result. Returns the
 * follow-up work for saved calls, for the caller to run after responding.
 */
export async function syncPendingDograhCalls(
  supabase: AdminClient,
  scope: { businessId?: string; limit: number }
): Promise<Array<() => Promise<void>>> {
  let query = supabase
    .from("call_attempts")
    .select("id, lead_id, attempt_id, created_at")
    .eq("status", "dispatched")
    .like("attempt_id", DOGRAH_ATTEMPT_PATTERN)
    .gte("created_at", new Date(Date.now() - PENDING_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(scope.limit);
  if (scope.businessId) query = query.eq("business_id", scope.businessId);

  const { data: pending } = await query;
  if (!pending?.length) return [];

  const results = await Promise.all(
    pending.map((attempt) =>
      syncDograhAttempt(supabase, attempt, { waitForTranscript: true }).catch(
        (err): SyncResult => ({ state: "error", error: String(err) })
      )
    )
  );

  return results.flatMap((result, i) => {
    if (result.state === "error") console.error("[Dograh] Could not sync", pending[i].attempt_id, result.error);
    return result.state === "recorded" ? [result.followUp] : [];
  });
}
