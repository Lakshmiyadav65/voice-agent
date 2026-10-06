import type { CallAttempt } from "@/lib/database.types";
import { formatSeconds } from "@/lib/format";
import { endReasonLabel, sanitizeCallDetails } from "@/lib/voice/call-details";

const STATUS: Record<CallAttempt["status"], { label: string; style: string }> = {
  connected: { label: "Completed", style: "bg-accent-soft text-accent" },
  no_answer: { label: "No answer", style: "bg-border/40 text-muted" },
  busy: { label: "Busy", style: "bg-border/40 text-muted" },
  failed: { label: "Failed", style: "bg-red-50 text-red-700" },
  dispatched: { label: "In progress", style: "bg-border/40 text-foreground" },
};

/** m:ss from the start of the call, as Cartesia's transcript shows it. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

/**
 * A finished call as the voice provider saw it: status and why it ended, web or phone,
 * from and to, the agent's speed, then the transcript with timestamps and the recording.
 */
export function CallDetailsPanel({ attempt }: { attempt: CallAttempt }) {
  const details = sanitizeCallDetails(attempt.call_details);
  const transcript = attempt.transcript ?? [];
  const customerSpoke = transcript.some((turn) => turn.role === "user");
  const status = STATUS[attempt.status];
  const ended = endReasonLabel(details?.endReason ?? null);
  const recordingUrl = `/api/calls/${attempt.id}/recording`;

  const facts = [
    details?.channel ? { label: "Type", value: details.channel === "web" ? "Web" : "Phone" } : null,
    { label: "Duration", value: attempt.duration ? formatSeconds(attempt.duration) : "—" },
    details?.from || details?.to
      ? { label: "From → To", value: `${details.from ?? "—"} → ${details.to ?? "—"}` }
      : null,
    { label: "Call success", value: attempt.status === "connected" && customerSpoke ? "Yes" : "No" },
    details?.avgResponseMs !== null && details?.avgResponseMs !== undefined
      ? { label: "Agent response time", value: `${(details.avgResponseMs / 1000).toFixed(2)} s average` }
      : null,
    details?.turns ? { label: "Turns", value: `${details.turns}${details.interruptions ? ` · ${details.interruptions} interrupted` : ""}` } : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  return (
    <div className="mt-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.style}`}>{status.label}</span>
        {ended ? <span className="text-xs text-muted">{ended}</span> : null}
      </div>
      {details?.errorMessage ? (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 font-mono text-xs text-red-800">{details.errorMessage}</p>
      ) : null}

      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </dl>

      {transcript.length || details?.hasRecording ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-accent">
            Transcript{details?.hasRecording ? " and recording" : ""}
          </summary>

          {details?.hasRecording ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* preload="none": nothing downloads until the owner presses play. */}
              <audio controls preload="none" src={recordingUrl} className="h-10 max-w-full flex-1">
                Your browser cannot play this recording.
              </audio>
              <a href={`${recordingUrl}?download=1`} className="text-sm font-semibold text-accent hover:underline">
                Download
              </a>
            </div>
          ) : null}

          {transcript.length ? (
            <ol className="mt-4 space-y-3">
              {transcript.map((turn, index) => {
                const agent = turn.role === "agent";
                return (
                  <li key={index} className={`flex ${agent ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        agent ? "bg-background text-foreground" : "bg-accent-soft text-ink"
                      }`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        {agent ? "Agent" : "Customer"}
                        {typeof turn.at === "number" ? ` · ${clock(turn.at)}` : ""}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{turn.en_text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
