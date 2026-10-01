import type { CallAttempt, Lead } from "@/lib/database.types";
import { secondsToFirstCall, type LeadWithCalls } from "@/lib/data/leads";
import { formatSeconds } from "@/lib/format";
import { campaignOf, sourceLabel } from "@/lib/leads/attribution";
import { formatCapturedValue, sanitizeCaptured } from "@/lib/voice/capture-fields";

const STATUS_STYLES: Record<Lead["status"], string> = {
  new: "bg-border/40 text-foreground",
  calling: "bg-accent-soft text-accent",
  contacted: "bg-accent-soft text-accent",
  unreachable: "bg-border/40 text-muted",
  converted: "bg-accent text-white",
  closed: "bg-border/40 text-muted",
};

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type LeadCallCardProps = {
  lead: LeadWithCalls;
  attempt: CallAttempt | null;
};

export function LeadCallCard({ lead, attempt }: LeadCallCardProps) {
  const visitAt = formatDateTime(attempt?.preferred_visit_at ?? null);
  const campaign = campaignOf(lead.utm);
  const waited = secondsToFirstCall(lead);
  const captured = sanitizeCaptured(attempt?.captured)
    .map((item) => ({ label: item.label, value: formatCapturedValue(item) }))
    .filter((item): item is { label: string; value: string } => Boolean(item.value));

  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">{lead.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {lead.phone}
            {lead.email ? ` · ${lead.email}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {attempt?.visit_requested ? (
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-white">
              Visit requested
            </span>
          ) : null}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[lead.status]}`}
          >
            {lead.status}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 text-foreground">
          <span className="text-muted">Source: </span>
          {sourceLabel(lead.source)}
        </span>
        {campaign ? (
          <span className="rounded-full border border-border px-2.5 py-1 text-foreground">
            <span className="text-muted">Campaign: </span>
            {campaign}
          </span>
        ) : null}
        {waited !== null ? (
          <span className="rounded-full border border-border px-2.5 py-1 text-foreground">
            <span className="text-muted">Called in: </span>
            {formatSeconds(waited)}
          </span>
        ) : null}
      </div>

      {lead.enquiry ? (
        <p className="mt-3 text-sm text-foreground">
          <span className="text-muted">Enquiry: </span>
          {lead.enquiry}
        </p>
      ) : null}

      {attempt?.summary ? (
        <div className="mt-4 rounded-lg bg-background p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Call summary
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{attempt.summary}</p>
        </div>
      ) : null}

      {captured.length > 0 ? (
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {captured.map((item) => (
            <div key={item.label} className="flex gap-2">
              <dt className="shrink-0 text-muted">{item.label}:</dt>
              <dd className="text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {visitAt ? (
        <p className="mt-3 text-sm text-accent">Preferred visit: {visitAt}</p>
      ) : null}

      <p className="mt-4 text-xs text-muted">
        {formatDateTime(lead.created_at)}
        {attempt?.duration ? ` · call lasted ${attempt.duration}s` : ""}
        {attempt?.failure_reason ? ` · ${attempt.failure_reason}` : ""}
      </p>
    </article>
  );
}
