import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

import { getChatGroq } from "@/lib/rag/qa-engine";
import type { CallOutcomeLabel, CallTranscriptTurn } from "@/lib/database.types";

export type CallAnalysis = {
  summary: string;
  visitRequested: boolean | null;
  preferredVisitAt: string | null;
  outcome: CallOutcomeLabel | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  unansweredQuestions: string[];
  topics: string[];
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

function fallbackSummary(text: string): string {
  const condensed = text.replace(/\s+/g, " ").trim();
  return condensed.slice(0, 400) + (condensed.length > 400 ? "..." : "");
}

function emptyAnalysis(summary: string, intent: ReturnType<typeof readVisitIntent>): CallAnalysis {
  return {
    summary,
    ...intent,
    outcome: null,
    sentiment: null,
    unansweredQuestions: [],
    topics: [],
  };
}

export async function analyzeCall(
  transcript: CallTranscriptTurn[] | null,
  finalVariables: Record<string, any> | null
): Promise<CallAnalysis> {
  const intent = readVisitIntent(finalVariables);

  if (!transcript?.length) {
    return {
      ...emptyAnalysis("No conversation was recorded for this call.", intent),
      outcome: "no_answer",
    };
  }

  const text = transcriptToText(transcript);
  const llm = getChatGroq();
  if (!llm) return emptyAnalysis(fallbackSummary(text), intent);

  try {
    const prompt = PromptTemplate.fromTemplate(`
You are analysing a sales call so the business can improve its voice agent.

Return ONLY a JSON object with these keys:
- "summary": 2-4 short sentences for the business owner covering what the
  customer asked, what they were told, and any follow-up agreed.
- "outcome": one of {outcomes}.
- "sentiment": one of positive, neutral, negative.
- "unanswered_questions": array of questions the CUSTOMER asked that the agent
  failed to answer, answered vaguely, or said it did not know. Quote them close
  to how the customer put them. Empty array if the agent answered everything.
- "topics": array of up to 5 short topic labels, e.g. "pricing", "delivery".

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
    });

    const parsed = extractJson(response);
    if (!parsed) return emptyAnalysis(fallbackSummary(text), intent);

    const outcome = OUTCOMES.includes(parsed.outcome) ? parsed.outcome : null;
    const sentiment = SENTIMENTS.includes(parsed.sentiment) ? parsed.sentiment : null;

    return {
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : fallbackSummary(text),
      ...intent,
      outcome,
      sentiment,
      unansweredQuestions: toStringList(parsed.unanswered_questions, 10),
      topics: toStringList(parsed.topics, 5),
    };
  } catch (err) {
    console.warn("[analyzeCall] Falling back to raw transcript:", err);
    return emptyAnalysis(fallbackSummary(text), intent);
  }
}
