import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

import { getChatGroq } from "@/lib/rag/qa-engine";
import type { CallTranscriptTurn } from "@/lib/database.types";

export type CallOutcome = {
  summary: string;
  visitRequested: boolean | null;
  preferredVisitAt: string | null;
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

/**
 * Visit details come from the variables the Sarvam agent collects during the
 * call, which are far more reliable than re-deriving intent from prose.
 */
function readVisitIntent(finalVariables: Record<string, any> | null) {
  if (!finalVariables) return { visitRequested: null, preferredVisitAt: null };

  return {
    visitRequested: coerceBoolean(
      finalVariables.visit_requested ?? finalVariables.wants_visit
    ),
    preferredVisitAt: coerceDate(
      finalVariables.preferred_visit_at ?? finalVariables.preferred_date
    ),
  };
}

export async function summarizeCall(
  transcript: CallTranscriptTurn[] | null,
  finalVariables: Record<string, any> | null
): Promise<CallOutcome> {
  const intent = readVisitIntent(finalVariables);

  if (!transcript?.length) {
    return { summary: "No conversation was recorded for this call.", ...intent };
  }

  const text = transcriptToText(transcript);
  const llm = getChatGroq();

  if (!llm) {
    const condensed = text.replace(/\s+/g, " ").trim();
    return {
      summary: condensed.slice(0, 400) + (condensed.length > 400 ? "..." : ""),
      ...intent,
    };
  }

  try {
    const prompt = PromptTemplate.fromTemplate(`
You are summarising a sales call for the business owner who will read it.

Write 2-4 short sentences covering: what the customer asked about, what they
were told, how interested they sounded, and any follow-up they agreed to.
Only state things present in the transcript. Do not invent details.

Transcript:
"""
{text}
"""

Summary:
`);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
    const response = await chain.invoke({ text: text.slice(0, 8000) });
    const summary = response.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    return {
      summary: summary || "Call completed; no summary could be generated.",
      ...intent,
    };
  } catch (err) {
    console.warn("[summarizeCall] Falling back to raw transcript:", err);
    const condensed = text.replace(/\s+/g, " ").trim();
    return {
      summary: condensed.slice(0, 400) + (condensed.length > 400 ? "..." : ""),
      ...intent,
    };
  }
}
