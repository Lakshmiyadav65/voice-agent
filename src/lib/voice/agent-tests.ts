/**
 * Test cases an owner writes for an agent: a caller scenario plus what the agent
 * should do. They run against our own simulation of the agent (same brief as a
 * real call), so they work whichever voice provider is connected, or none.
 */

export type TranscriptLine = { role: "agent" | "caller"; text: string };

export type TestRun = {
  passed: boolean;
  reason: string;
  transcript: TranscriptLine[];
  ranAt: string;
};

export type AgentTest = {
  id: string;
  name: string;
  /** Who the caller is and what they want, e.g. "Asks for the price of a 2BHK, then says it's too expensive". */
  scenario: string;
  /** What a good agent does, e.g. "Quotes only prices from the knowledge base and offers a site visit". */
  expected: string;
  lastRun: TestRun | null;
};

export const MAX_TESTS = 20;
const MAX_TEXT = 600;

function str(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sanitizeRun(value: unknown): TestRun | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.passed !== "boolean" || typeof raw.ranAt !== "string") return null;
  const transcript = Array.isArray(raw.transcript)
    ? raw.transcript
        .map((line) => {
          const l = (line ?? {}) as Record<string, unknown>;
          return { role: l.role === "agent" ? "agent" : "caller", text: str(l.text, 2000) } as TranscriptLine;
        })
        .filter((l) => l.text)
        .slice(0, 40)
    : [];
  return { passed: raw.passed, reason: str(raw.reason), transcript, ranAt: raw.ranAt };
}

export function sanitizeTests(value: unknown): AgentTest[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tests: AgentTest[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = str(raw.id, 40).replace(/[^\w-]/g, "");
    const name = str(raw.name, 80);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    tests.push({
      id,
      name,
      scenario: str(raw.scenario),
      expected: str(raw.expected),
      lastRun: sanitizeRun(raw.lastRun),
    });
    if (tests.length === MAX_TESTS) break;
  }
  return tests;
}

export function newTestId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
