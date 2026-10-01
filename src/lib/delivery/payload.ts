import type { Business, CallAttempt, Lead } from "@/lib/database.types";
import { campaignOf, sanitizeAttribution, sourceLabel } from "@/lib/leads/attribution";

/**
 * The one shape every channel sends. Webhook receivers get it verbatim; email
 * and Sheets render from it, so a field added here reaches all three.
 */
export type CallResultPayload = {
  event: "call.completed" | "test";
  business: { id: string; name: string };
  lead: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    enquiry: string | null;
    source: string;
    source_label: string;
    campaign: string | null;
    utm: Record<string, string>;
    submitted_at: string;
  };
  call: {
    status: CallAttempt["status"];
    duration_seconds: number | null;
    outcome: CallAttempt["outcome"];
    sentiment: CallAttempt["sentiment"];
    summary: string | null;
    visit_requested: boolean;
    preferred_visit_at: string | null;
    topics: string[];
    unanswered_questions: string[];
    called_at: string;
  };
  dashboard_url: string | null;
};

export function dashboardUrl(): string | null {
  const base = process.env.APP_PUBLIC_URL?.trim();
  return base ? `${base.replace(/\/$/, "")}/dashboard/leads` : null;
}

export function buildCallResultPayload(
  business: Pick<Business, "id" | "name">,
  lead: Lead,
  attempt: CallAttempt
): CallResultPayload {
  return {
    event: "call.completed",
    business: { id: business.id, name: business.name },
    lead: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      enquiry: lead.enquiry,
      source: lead.source,
      source_label: sourceLabel(lead.source),
      campaign: campaignOf(lead.utm) ?? null,
      utm: sanitizeAttribution(lead.utm),
      submitted_at: lead.created_at,
    },
    call: {
      status: attempt.status,
      duration_seconds: attempt.duration,
      outcome: attempt.outcome,
      sentiment: attempt.sentiment,
      summary: attempt.summary,
      visit_requested: Boolean(attempt.visit_requested),
      preferred_visit_at: attempt.preferred_visit_at,
      topics: attempt.topics ?? [],
      unanswered_questions: attempt.unanswered_questions ?? [],
      called_at: attempt.created_at,
    },
    dashboard_url: dashboardUrl(),
  };
}

/** A realistic sample so owners can see exactly what a real result will look like. */
export function buildTestPayload(business: Pick<Business, "id" | "name">): CallResultPayload {
  const now = new Date().toISOString();
  return {
    event: "test",
    business: { id: business.id, name: business.name },
    lead: {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Test Lead",
      phone: "+910000000000",
      email: null,
      enquiry: "This is a test message from your AI employee settings.",
      source: "facebook",
      source_label: "Facebook",
      campaign: "test-campaign",
      utm: { utm_source: "facebook", utm_campaign: "test-campaign" },
      submitted_at: now,
    },
    call: {
      status: "connected",
      duration_seconds: 74,
      outcome: "interested",
      sentiment: "positive",
      summary:
        "This is a sample result. Real results include the AI's summary of the call, the outcome and anything the customer asked for.",
      visit_requested: true,
      preferred_visit_at: null,
      topics: ["pricing"],
      unanswered_questions: [],
      called_at: now,
    },
    dashboard_url: dashboardUrl(),
  };
}

export const OUTCOME_TEXT: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  callback_requested: "Wants a callback",
  wrong_number: "Wrong number",
  no_answer: "No answer",
  unclear: "Unclear",
};

const STATUS_TEXT: Record<CallAttempt["status"], string> = {
  dispatched: "Calling",
  connected: "Picked up",
  no_answer: "No answer",
  busy: "Busy",
  failed: "Call failed",
};

/** One-line headline used for email subjects and the Sheet's "Result" column. */
export function resultHeadline(payload: CallResultPayload): string {
  const { call } = payload;
  if (call.status !== "connected") return STATUS_TEXT[call.status];
  if (call.visit_requested) return "Wants to visit";
  return call.outcome ? OUTCOME_TEXT[call.outcome] ?? call.outcome : "Picked up";
}

/** Flat row for spreadsheets: column names are the keys, in this order. */
export function toSheetRow(payload: CallResultPayload): Record<string, string | number> {
  const { lead, call } = payload;
  return {
    "Called at": new Date(call.called_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    Name: lead.name,
    Phone: lead.phone,
    Result: resultHeadline(payload),
    Summary: call.summary ?? "",
    Enquiry: lead.enquiry ?? "",
    Source: lead.source_label,
    Campaign: lead.campaign ?? "",
    "Preferred visit": call.preferred_visit_at
      ? new Date(call.preferred_visit_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
      : "",
    "Call length (s)": call.duration_seconds ?? "",
    Sentiment: call.sentiment ?? "",
  };
}
