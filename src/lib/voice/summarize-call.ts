import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

import { getChatGroq } from "@/lib/rag/qa-engine";
import type { CallOutcomeLabel, CallTranscriptTurn } from "@/lib/database.types";
import type { CaptureField, CapturedValue } from "@/lib/voice/capture-fields";

export type CallAnalysis = {
  summary: string;
  visitRequested: boolean | null;
  preferredVisitAt: string | null;
  outcome: CallOutcomeLabel | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  unansweredQuestions: string[];
  topics: string[];
  captured: CapturedValue[];
};

const OUTCOMES: CallOutcomeLabel[] = [
  "interested",
  "not_interested",
  "callback_requested",
  "wrong_number",
  "no_answer",
  "unclear",
];
const SENTIMENTS = ["positive", "neutral", "negative"] as const;

type LeadQuality = "good" | "bad" | "unclear";
const LEAD_QUALITY_LABEL: Record<LeadQuality, string> = {
  good: "Good lead",
  bad: "Bad lead",
  unclear: "Unclear lead",
};
// An outcome this clear decides the verdict, so the summary never contradicts the outcome.
const QUALITY_BY_OUTCOME: Partial<Record<CallOutcomeLabel, LeadQuality>> = {
  interested: "good",
  callback_requested: "good",
  not_interested: "bad",
  wrong_number: "bad",
};

const TRUTHY = new Set(["true", "yes", "y", "1", "interested", "confirmed"]);
const FALSY = new Set(["false", "no", "n", "0", "not_interested", "declined"]);

function transcriptToText(transcript: CallTranscriptTurn[]): string {
  return transcript
    .map((turn) => `${turn.role === "agent" ? "Agent" : "Customer"}: ${turn.en_text}`)
    .join("\n");
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY.has(normalized)) return true;
    if (FALSY.has(normalized)) return false;
  }
  return null;
}

function coerceDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function readVisitIntent(finalVariables: Record<string, any> | null) {
  return {
    visitRequested: coerceBoolean(
      finalVariables?.visit_requested ?? finalVariables?.wants_visit
    ),
    preferredVisitAt: coerceDate(
      finalVariables?.preferred_visit_at ?? finalVariables?.preferred_date
    ),
  };
}

function coerceCaptured(field: CaptureField, value: unknown): CapturedValue["value"] {
  if (value === null || value === undefined || value === "") return null;

  switch (field.type) {
    case "yes_no":
      return coerceBoolean(value);
    case "number": {
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      const text = String(value).trim();
      // Only plain figures become numbers; "around 20 thousand" stays as words rather than becoming 20.
      return /^[₹\s\d,.-]+$/.test(text) && /\d/.test(text)
        ? Number(text.replace(/[^\d.-]/g, ""))
        : text.slice(0, 200);
    }
    case "date":
      return coerceDate(value) ?? String(value).slice(0, 200);
    default:
      return String(value).trim().slice(0, 200) || null;
  }
}

/** Every configured field gets an entry, null when the call never covered it. */
function readCaptured(fields: CaptureField[], raw: unknown): CapturedValue[] {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    value: coerceCaptured(field, source[field.key]),
  }));
}

function captureInstructions(fields: CaptureField[]): string {
  if (!fields.length) return "";
  const lines = fields.map((f) => {
    const shape =
      f.type === "yes_no" ? "true or false" : f.type === "number" ? "a number" : f.type === "date" ? "an ISO 8601 date-time" : "short text";
    return `  - "${f.key}": ${f.label}${f.hint ? ` (${f.hint})` : ""} — ${shape}`;
  });
  return `- "captured": an object with exactly these keys. Use null for anything the
  customer did not clearly say:
${lines.join("\n")}`;
}

function toStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

/** Models wrap JSON in prose or fences often enough to be worth handling. */
function extractJson(raw: string): Record<string, any> | null {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * The owner reads the verdict first: "Good lead: <why>. Next step: <what>." then the call
 * itself. It lives only in the summary text, so nothing else about the call changes.
 */
function withLeadVerdict(
  summary: string,
  outcome: CallOutcomeLabel | null,
  parsed: Record<string, unknown>
): string {
  const asked = typeof parsed.lead_quality === "string" ? parsed.lead_quality.trim().toLowerCase() : "";
  const quality: LeadQuality =
    (outcome && QUALITY_BY_OUTCOME[outcome]) ||
    (asked === "good" || asked === "bad" || asked === "unclear" ? asked : "unclear");
  const sentence = (value: unknown) => {
    const text = typeof value === "string" ? value.trim().replace(/[.\s]+$/, "") : "";
    return text ? `${text}.` : "";
  };
  const reason = sentence(parsed.lead_reason);
  const nextStep = sentence(parsed.next_step);
  const verdict = [`${LEAD_QUALITY_LABEL[quality]}${reason ? `: ${reason}` : "."}`, nextStep && `Next step: ${nextStep}`]
    .filter(Boolean)
    .join(" ");
  return `${verdict} ${summary}`;
}

function fallbackSummary(text: string): string {
  const condensed = text.replace(/\s+/g, " ").trim();
  return condensed.slice(0, 400) + (condensed.length > 400 ? "..." : "");
}

function emptyAnalysis(
  summary: string,
  intent: ReturnType<typeof readVisitIntent>,
  fields: CaptureField[]
): CallAnalysis {
  return {
    summary,
    ...intent,
    outcome: null,
    sentiment: null,
    unansweredQuestions: [],
    topics: [],
    captured: readCaptured(fields, null),
  };
}

export async function analyzeCall(
  transcript: CallTranscriptTurn[] | null,
  finalVariables: Record<string, any> | null,
  captureFields: CaptureField[] = []
): Promise<CallAnalysis> {
  const intent = readVisitIntent(finalVariables);

  if (!transcript?.length) {
    return {
      ...emptyAnalysis("No conversation was recorded for this call.", intent, captureFields),
      outcome: "no_answer",
    };
  }

  const text = transcriptToText(transcript);
  const llm = getChatGroq();
  if (!llm) return emptyAnalysis(fallbackSummary(text), intent, captureFields);

  try {
    const prompt = PromptTemplate.fromTemplate(`
You are analysing a sales call so the business can improve its voice agent and
follow up with the right prospects. The transcript may be in Telugu, Hindi or
English, often written in Latin letters; always answer in English.

Return ONLY a JSON object with these keys:
- "summary": 2-4 short sentences for the business owner covering what the
  customer asked, what they were told, and any follow-up agreed.
- "lead_quality": one of good, bad, unclear. Judge only from what the CUSTOMER
  said and agreed to:
    good = they showed interest: asked about price, location, size or details,
    agreed to a site visit, a callback or to receive information.
    bad = they said they are not interested, it is the wrong person, they asked
    not to be called, or they are clearly not a buyer.
    unclear = the call ended before they showed either.
- "lead_reason": one short sentence saying what the customer said that shows
  this, e.g. "Asked for 2BHK prices in Kokapet".
- "next_step": the follow-up agreed on the call, or the best next action for
  the business if none was agreed, e.g. "Call back on Saturday with the price list".
- "outcome": one of {outcomes}.
- "sentiment": one of positive, neutral, negative.
- "unanswered_questions": array of questions the CUSTOMER asked that the agent
  failed to answer, answered vaguely, or said it did not know. Quote them close
  to how the customer put them. Empty array if the agent answered everything.
- "topics": array of up to 5 short topic labels, e.g. "pricing", "delivery".
{capture}

Only use what is in the transcript. Do not invent details.

Transcript:
"""
{text}
"""

JSON:
`);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const response = await chain.invoke({
      text: text.slice(0, 8000),
      outcomes: OUTCOMES.join(", "),
      capture: captureInstructions(captureFields),
    });

    const parsed = extractJson(response);
    if (!parsed) return emptyAnalysis(fallbackSummary(text), intent, captureFields);

    const outcome = OUTCOMES.includes(parsed.outcome) ? parsed.outcome : null;
    const sentiment = SENTIMENTS.includes(parsed.sentiment) ? parsed.sentiment : null;

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallbackSummary(text);

    return {
      summary: withLeadVerdict(summary, outcome, parsed),
      ...intent,
      outcome,
      sentiment,
      unansweredQuestions: toStringList(parsed.unanswered_questions, 10),
      topics: toStringList(parsed.topics, 5),
      captured: readCaptured(captureFields, parsed.captured),
    };
  } catch (err) {
    console.warn("[analyzeCall] Falling back to raw transcript:", err);
    return emptyAnalysis(fallbackSummary(text), intent, captureFields);
  }
}
