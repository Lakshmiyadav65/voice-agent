import { AGENT_LANGUAGES, type AgentLanguage } from "@/lib/voice/agent-settings";

/**
 * What staff trained in the voice provider's console, recorded on the platform so
 * the client can see how their agent was set up. It is a record, not a setting:
 * calls never read it, since the provider already runs this training. Staff
 * update it after every change in the console, because the provider's API cannot
 * read an agent's prompt or voice back to us.
 */

export type TrainingChange = { at: string; by: string; note: string };

export type AgentTraining = {
  prompt: string;
  greeting: string;
  // "" when staff left it unset.
  language: AgentLanguage | "";
  voice: string;
  updatedAt: string;
  updatedBy: string;
  // Newest first.
  changes: TrainingChange[];
};

export const TRAINING_LIMITS = {
  prompt: 20000,
  greeting: 500,
  voice: 40,
  note: 300,
  changes: 30,
} as const;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function language(value: unknown): AgentLanguage | "" {
  return AGENT_LANGUAGES.find((l) => l === value) ?? "";
}

/** Reads the stored record, or null when nothing has been recorded yet. */
export function sanitizeAgentTraining(value: unknown): AgentTraining | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const changes = Array.isArray(raw.changes) ? raw.changes : [];
  return {
    prompt: text(raw.prompt, TRAINING_LIMITS.prompt),
    greeting: text(raw.greeting, TRAINING_LIMITS.greeting),
    language: language(raw.language),
    voice: text(raw.voice, TRAINING_LIMITS.voice),
    updatedAt: text(raw.updatedAt, 40),
    updatedBy: text(raw.updatedBy, 200),
    changes: changes
      .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
      .map((c) => ({ at: text(c.at, 40), by: text(c.by, 200), note: text(c.note, TRAINING_LIMITS.note) }))
      .filter((c) => c.at && c.note)
      .slice(0, TRAINING_LIMITS.changes),
  };
}

/**
 * Applies a staff edit: the new prompt, greeting, language and voice replace the
 * old ones, and the note, when given, goes to the top of the change history.
 */
export function applyTrainingEdit(
  current: AgentTraining | null,
  edit: Record<string, unknown>,
  by: string,
  at: string = new Date().toISOString()
): AgentTraining {
  const note = text(edit.note, TRAINING_LIMITS.note);
  const changes = current?.changes ?? [];
  return {
    prompt: text(edit.prompt, TRAINING_LIMITS.prompt),
    greeting: text(edit.greeting, TRAINING_LIMITS.greeting),
    language: language(edit.language),
    voice: text(edit.voice, TRAINING_LIMITS.voice),
    updatedAt: at,
    updatedBy: by,
    changes: (note ? [{ at, by, note }, ...changes] : changes).slice(0, TRAINING_LIMITS.changes),
  };
}

export function formatTrainingDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
