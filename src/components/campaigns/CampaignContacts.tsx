"use client";

import { Fragment, useId, useState } from "react";

import { NeverCallButton } from "@/components/campaigns/CampaignControls";
import { CallDetailsPanel } from "@/components/owner/CallDetailsPanel";
import type { ContactWithCalls } from "@/lib/data/campaigns";
import type { CallAttempt, CampaignContact } from "@/lib/database.types";
import { formatSeconds } from "@/lib/format";

const CONTACT_STATUS: Record<CampaignContact["status"], { label: string; className: string }> = {
  queued: { label: "Waiting", className: "text-muted" },
  calling: { label: "On a call", className: "text-accent font-semibold" },
  completed: { label: "Picked up", className: "text-accent" },
  unreachable: { label: "No answer", className: "text-warn" },
  failed: { label: "Call failed", className: "text-warn" },
  do_not_call: { label: "Do not call", className: "text-muted line-through" },
};

const OUTCOME: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  callback_requested: "Wants a callback",
  wrong_number: "Wrong number",
  no_answer: "No answer",
  unclear: "Unclear",
};

type CallSlice = NonNullable<ContactWithCalls["leads"]>["call_attempts"][number];

function byTime<T extends { created_at: string }>(calls: T[]): T[] {
  return [...calls].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** "2:40 PM" today, otherwise "9 Oct, 10:30 AM", in the campaign's zone. */
function when(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString("en-IN", { timeZone });
  const time = date
    .toLocaleTimeString("en-IN", { timeZone, hour: "numeric", minute: "2-digit" })
    .replace(/[ap]m/, (suffix) => suffix.toUpperCase());
  return day(date) === day(new Date()) ? time : `${date.toLocaleDateString("en-IN", { timeZone, day: "numeric", month: "short" })}, ${time}`;
}

/**
 * The callback the customer asked for, with the gap from the call that asked for it,
 * since "call me in 5 minutes" is what they actually said.
 */
function callbackLine(contact: ContactWithCalls, timeZone: string): { text: string; failed: boolean } | null {
  const lead = contact.leads;
  if (!lead?.callback_at || !lead.callback_status) return null;

  const calls = byTime(lead.call_attempts);
  const asked = [...calls].reverse().find((c) => c.outcome === "callback_requested" && c.created_at < lead.callback_at!) ?? calls[0];
  const minutes = asked ? Math.round((Date.parse(lead.callback_at) - Date.parse(asked.created_at)) / 60_000) : 0;
  // Only near callbacks read naturally as "in N minutes"; later ones are a time of day.
  const gap = minutes > 0 && minutes <= 180 ? ` · asked for ${minutes} min later` : "";
  const at = when(lead.callback_at, timeZone);

  switch (lead.callback_status) {
    case "scheduled":
      return { text: `Callback due ${at}${gap}`, failed: false };
    case "calling":
      return { text: `Calling back now${gap}`, failed: false };
    case "done":
      return { text: `Called back ${at}${gap}`, failed: false };
    case "failed":
      return { text: `Callback at ${at} didn't go out${gap}. Call by hand.`, failed: true };
  }
}

function callLabel(calls: CallAttempt[], index: number): string {
  if (index === 0) return "First call";
  return calls[index - 1]!.outcome === "callback_requested" ? "Callback" : `Retry ${index}`;
}

export function CampaignContacts({
  contacts,
  campaignId,
  canManage,
  timeZone,
}: {
  contacts: ContactWithCalls[];
  campaignId: string;
  canManage: boolean;
  timeZone: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="bg-background text-left text-xs uppercase tracking-[0.1em] text-muted">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Name</th>
            <th className="px-4 py-2.5 font-semibold">Phone</th>
            <th className="px-4 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 text-right font-semibold">Tries</th>
            <th className="px-4 py-2.5 font-semibold">Outcome</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {contacts.map((contact) => (
            <ContactRows key={contact.id} contact={contact} campaignId={campaignId} canManage={canManage} timeZone={timeZone} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContactRows({
  contact,
  campaignId,
  canManage,
  timeZone,
}: {
  contact: ContactWithCalls;
  campaignId: string;
  canManage: boolean;
  timeZone: string;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<CallAttempt[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const status = CONTACT_STATUS[contact.status];
  const slices: CallSlice[] = byTime(contact.leads?.call_attempts ?? []);
  const outcome = [...slices].reverse().find((a) => a.outcome)?.outcome;
  const callback = callbackLine(contact, timeZone);
  const retryAt =
    contact.status === "queued" && contact.attempts > 0
      ? new Date(contact.next_attempt_at).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone })
      : null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    // Fetched on every open, so a call that ended since the page loaded shows up.
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/contacts/${contact.id}/calls`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load the calls.");
      setCalls(data.calls as CallAttempt[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Fragment>
      <tr onClick={toggle} className={`cursor-pointer transition hover:bg-background/70 ${open ? "bg-background/70" : ""}`}>
        <td className="px-4 py-2.5 text-ink">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            className="flex items-start gap-2 text-left"
          >
            <svg
              viewBox="0 0 24 24"
              className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-90 text-accent" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
            <span>
              <span className="font-medium">{contact.name}</span>
              {contact.notes ? <span className="block text-xs text-muted">{contact.notes}</span> : null}
            </span>
          </button>
        </td>
        <td className="px-4 py-2.5 tabular-nums text-foreground">{contact.phone}</td>
        <td className="px-4 py-2.5">
          <span className={status.className}>{status.label}</span>
          {retryAt ? <span className="block text-xs text-muted">Retry at {retryAt}</span> : null}
          {contact.last_error ? <span className="block text-xs text-warn">{contact.last_error}</span> : null}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums">{contact.attempts}</td>
        <td className="px-4 py-2.5 text-foreground">
          {outcome ? OUTCOME[outcome] ?? outcome : <span className="text-muted">—</span>}
          {callback ? <span className={`block text-xs font-medium ${callback.failed ? "text-warn" : "text-accent"}`}>{callback.text}</span> : null}
        </td>
        <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
          {canManage && contact.status !== "do_not_call" ? <NeverCallButton phone={contact.phone} /> : null}
        </td>
      </tr>

      {open ? (
        <tr id={panelId} className="bg-background/70">
          <td colSpan={6} className="px-4 pb-5 pt-1">
            {/* Pinned to the visible width, so on a phone the panel doesn't scroll sideways with the table. */}
            <div className="sticky left-4 max-w-[calc(100vw-5rem)] space-y-4 sm:max-w-none">
              {loading && !calls ? <p className="py-3 text-sm text-muted">Loading calls…</p> : null}
              {error ? <p className="py-3 text-sm text-warn">{error}</p> : null}
              {calls && !calls.length ? (
                <p className="py-3 text-sm text-muted">
                  {contact.status === "do_not_call" ? "This number is on the do-not-call list." : "No calls yet. This contact is waiting to be called."}
                </p>
              ) : null}
              {calls?.map((call, i) => (
                <section key={call.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h4 className="text-sm font-semibold text-ink">
                      {callLabel(calls, i)}
                      {call.outcome ? <span className="ml-2 font-normal text-muted">· {OUTCOME[call.outcome] ?? call.outcome}</span> : null}
                    </h4>
                    <span className="text-xs text-muted">
                      {when(call.created_at, timeZone)}
                      {call.duration ? ` · ${formatSeconds(call.duration)}` : ""}
                    </span>
                  </div>
                  {call.summary ? (
                    <div className="mt-3 rounded-lg bg-background p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Summary</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground">{call.summary}</p>
                    </div>
                  ) : null}
                  {call.status === "dispatched" ? (
                    <p className="mt-3 text-sm text-muted">This call is still going on. Its summary, transcript and recording appear when it ends.</p>
                  ) : (
                    // The latest call opens with its transcript showing; earlier ones stay folded.
                    <CallDetailsPanel attempt={call} transcriptOpen={i === calls.length - 1} />
                  )}
                </section>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
